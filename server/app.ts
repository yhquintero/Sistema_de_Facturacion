import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { INTERNATIONAL_PAPER_STANDARDS, PAPER_STANDARDS_LIST, type PaperOrientation, type PaperSizeId } from '../shared/paperStandards';
import { deleteClient, deleteContract, deleteInvoice, deleteServiceCatalogItem, getDashboardStats, getInvoiceById, getInvoiceEvents, getInvoiceIntegrity, getRevenueGoals, getSupplierProfile, getWorkspaceInfo, listClients, listContracts, listInvoices, listServiceCatalog, saveClient, saveRevenueGoals, saveContract, saveInvoice, saveServiceCatalogItem, signInvoiceByClient, updateInvoiceStatus, updateSupplierProfile } from './db';
import { generateInvoicePdfBuffer } from './exporters/pdfExporter';
import { generateInvoiceDocxBuffer } from './exporters/docxExporter';
import { generateInvoiceXlsxBuffer } from './exporters/xlsxExporter';
import { sanitizeFilename } from './exporters/formatHelpers';

import { actorStore } from './actor';
import { PERMISSIONS, PERMISSION_LABELS, ROLE_INFO, ROLE_PERMISSIONS, type Permission, type SessionInfo } from '../shared/permissions';
import { bootstrapAdminFromPassword, changeOwnPassword, clearLoginFailures, createFirstAdmin, createSession, createUser, deleteSession, disableTwoFactor, enableTwoFactor, failureKey, findUserForLogin, getDecoyHash, getUser, hasUsers, listOwnSessions, listSecurityEvents, listUsers, loginLockRemainingMs, recordSecurityEvent, regenerateRecoveryCodes, registerLoginFailure, resolveSession, revokeOwnSessions, revokeUserSessions, sessionIdleMs, sessionMaxMs, startTwoFactorSetup, toSessionUser, updateUser, verifyPassword, verifySecondFactor, type ActorRef } from './users';
import { backupStatus, createBackup, isBackupName, listBackups } from './backups';
import { backupDirectory } from './paths';
import { db } from './db';
import QRCode from 'qrcode';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { TwoFactorChallenge, WorkspaceUser } from '../shared/permissions';

class HttpError extends Error { constructor(public status: number, message: string, public code = '') { super(message); } }
type Auth = { open: boolean; user: WorkspaceUser | null; tokenHash: string; permissions: Permission[] };
const auth = (res: Response) => res.locals.auth as Auth;
const can = (res: Response, permission: Permission) => auth(res).permissions.includes(permission);
const forbidden = (res: Response, permission: Permission) => new HttpError(403, `Tu rol (${auth(res).user ? ROLE_INFO[auth(res).user!.role].label : 'actual'}) no permite: ${PERMISSION_LABELS[permission].toLowerCase()}.`, 'FORBIDDEN');
function assertCan(res: Response, permission: Permission) { if (!can(res, permission)) throw forbidden(res, permission); }
function respond(action: (req: Request, res: Response) => unknown, status = 200) { return (req: Request, res: Response, next: express.NextFunction) => { try { const data = action(req, res); if (!res.headersSent) res.status(status).json(data); } catch (error) { next(error); } }; }
function respondAsync(action: (req: Request, res: Response) => Promise<unknown>, status = 200) { return (req: Request, res: Response, next: express.NextFunction) => { action(req, res).then(data => { if (!res.headersSent) res.status(status).json(data); }).catch(next); }; }
const requirePermission = (permission: Permission) => (_req: Request, res: Response, next: express.NextFunction) => { if (can(res, permission)) next(); else next(forbidden(res, permission)); };
const SESSION_COOKIE = 'nexo_session';
const cookieToken = (req: Request) => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || '';
const actorRef = (req: Request, res: Response): ActorRef => { const user = auth(res).user; return { id: user?.id || '', name: user ? user.displayName : 'Modo abierto', ip: req.ip || '' }; };
/** En modo abierto (sin cuentas) se permite todo salvo la gestión de usuarios, que exige el asistente de configuración. */
const OPEN_MODE_PERMISSIONS = PERMISSIONS.filter(p => p !== 'users.manage');
/** Cabecera propia exigida en toda modificación: un formulario o enlace de otro sitio no puede enviarla (anti-CSRF). */
export const CSRF_HEADER = 'x-nexo-request';
const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export type AppOptions = {
  password?: string; allowSetup?: boolean; adminUsername?: string;
  /** CSP, X-Frame-Options, COOP/CORP. Por defecto solo en producción (Vite usa scripts en línea en desarrollo). */
  securityHeaders?: boolean;
  /** Exige verificación en dos pasos a los administradores (REQUIRE_ADMIN_2FA=true). */
  requireAdminTwoFactor?: boolean;
  /** Copias automáticas programadas activas (solo informativo para el panel). */
  scheduledBackups?: boolean;
};

export function createApp(options: AppOptions = {}) {
  const app = express(); const password = options.password ?? process.env.APP_PASSWORD ?? '';
  if (password && password.length < 12) throw new Error('APP_PASSWORD debe tener al menos 12 caracteres.');
  const allowSetup = options.allowSetup ?? process.env.NODE_ENV !== 'production';
  // Migración: APP_PASSWORD crea el primer administrador si todavía no hay cuentas.
  bootstrapAdminFromPassword(password, options.adminUsername ?? process.env.ADMIN_USERNAME ?? 'admin');
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  const strictHeaders = options.securityHeaders ?? process.env.NODE_ENV === 'production';
  const requireAdminTwoFactor = options.requireAdminTwoFactor ?? process.env.REQUIRE_ADMIN_2FA === 'true';
  // Las palabras clave de CSP van entre comillas simples; .env y Docker suelen quitarlas, así que se normalizan.
  const frameAncestors = (process.env.FRAME_ANCESTORS || 'self').replace(/[;,\r\n]/g, ' ').split(/\s+/).filter(Boolean)
    .map(token => /^'?(self|none)'?$/i.test(token) ? `'${token.replace(/'/g, '').toLowerCase()}'` : token).join(' ') || "'self'";
  const contentSecurityPolicy = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'", "frame-src 'self' blob:", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", `frame-ancestors ${frameAncestors}`].join('; ');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()');
    if (strictHeaders) {
      res.setHeader('Content-Security-Policy', contentSecurityPolicy);
      if (frameAncestors === "'self'" || frameAncestors === "'none'") res.setHeader('X-Frame-Options', frameAncestors === "'none'" ? 'DENY' : 'SAMEORIGIN');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.get('host')) { res.status(403).json({ error: 'Origen de solicitud no autorizado.' }); return; } } catch { res.status(403).json({ error: 'Origen no válido.' }); return; }
      }
      if (req.get(CSRF_HEADER) !== '1') { res.status(403).json({ error: 'Solicitud rechazada por seguridad. Recarga la página e inténtalo de nuevo.', code: 'CSRF_HEADER_MISSING' }); return; }
    }
    next();
  });
  // Resuelve la sesión en cada solicitud: el rol y el estado de la cuenta se leen siempre de la base.
  app.use('/api', (req, res, next) => {
    if (!hasUsers()) { res.locals.auth = { open: true, user: null, tokenHash: '', permissions: OPEN_MODE_PERMISSIONS } satisfies Auth; next(); return; }
    // GET /api/session?probe=1 consulta el estado sin contar como actividad (aviso de inactividad entre pestañas).
    const resolved = resolveSession(cookieToken(req), { touch: !(req.method === 'GET' && req.path === '/session' && req.query.probe === '1') });
    if (resolved && 'lastSeenAt' in resolved) res.locals.lastSeenAt = resolved.lastSeenAt;
    const session = resolved && 'tokenHash' in resolved ? resolved : null;
    if (resolved && 'expired' in resolved) res.locals.sessionExpired = resolved.expired;
    res.locals.auth = { open: false, user: session?.user ?? null, tokenHash: session?.tokenHash ?? '', permissions: session ? [...ROLE_PERMISSIONS[session.user.role]] : [] } satisfies Auth;
    next();
  });
  const twoFactorSetupRequired = (user: WorkspaceUser | null) => !!user && requireAdminTwoFactor && user.role === 'admin' && !user.twoFactorEnabled;
  const sessionInfo = (res: Response): SessionInfo => { const a = auth(res); return { protected: !a.open, authenticated: a.open || !!a.user, ...getWorkspaceInfo(), user: a.user ? toSessionUser(a.user) : null, permissions: a.permissions, setupAvailable: a.open && allowSetup, idleMinutes: a.user ? Math.round(sessionIdleMs() / 60_000) : 0, ...(a.user && sessionIdleMs() ? { idleRemainingSeconds: Math.max(0, Math.floor(((res.locals.lastSeenAt as number | undefined ?? Date.now()) + sessionIdleMs() - Date.now()) / 1000)) } : {}), twoFactorSetupRequired: twoFactorSetupRequired(a.user) }; };
  const setSessionCookie = (req: Request, res: Response, token: string) => res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: sessionMaxMs(), path: '/' });
  const startSession = (req: Request, res: Response, user: WorkspaceUser) => { const { token, tokenHash } = createSession(user.id, { ip: req.ip, userAgent: req.get('user-agent') }); setSessionCookie(req, res, token); res.locals.auth = { open: false, user, tokenHash, permissions: [...ROLE_PERMISSIONS[user.role]] } satisfies Auth; };
  const attempts = new Map<string, { count: number; reset: number }>();
  const throttle = (req: Request) => {
    const now = Date.now(); const key = req.ip || 'unknown';
    for (const [ip, attempt] of attempts) if (attempt.reset < now) attempts.delete(ip);
    if (attempts.size > 5000) throw new HttpError(429, 'Demasiadas solicitudes. Inténtalo más tarde.');
    const attempt = attempts.get(key) || { count: 0, reset: now + 15 * 60_000 };
    if (attempt.count >= 30) throw new HttpError(429, 'Demasiados intentos desde esta conexión. Espera 15 minutos antes de volver a intentar.');
    return { fail: () => { attempt.count++; attempts.set(key, attempt); }, clear: () => attempts.delete(key) };
  };

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Nexo · Sistema de Facturación (Web, Servidor, Móvil)', timestamp: new Date().toISOString(), supportedFormats: ['pdf', 'docx', 'xlsx'], paperStandards: PAPER_STANDARDS_LIST.map(p => p.id) }));
  app.get('/api/session', (_req, res) => res.json({ ...sessionInfo(res), ...(res.locals.sessionExpired ? { expiredReason: res.locals.sessionExpired } : {}) }));

  /* Bloqueo por usuario+IP: LOGIN_MAX_ATTEMPTS fallos (contraseña o código) bloquean LOGIN_LOCK_MINUTES. */
  const assertNotLocked = (key: string) => { const remaining = loginLockRemainingMs(key); if (remaining) throw new HttpError(429, `Acceso bloqueado temporalmente por intentos fallidos. Espera ${minutes(remaining)} min antes de volver a intentar.`, 'LOGIN_LOCKED'); };
  const failLogin = (req: Request, key: string, status: number, message: string, target: { id?: string; name: string }): never => {
    const { remaining, lockedMs } = registerLoginFailure(key);
    if (lockedMs) { recordSecurityEvent('login_locked', { id: '', name: '', ip: req.ip }, target, { minutes: minutes(lockedMs) }); throw new HttpError(429, `Demasiados intentos fallidos. El acceso queda bloqueado ${minutes(lockedMs)} minutos.`, 'LOGIN_LOCKED'); }
    throw new HttpError(status, `${message} ${remaining === 1 ? 'Te queda 1 intento' : `Te quedan ${remaining} intentos`} antes del bloqueo temporal.`);
  };
  /* Segundo paso pendiente: reto efímero en memoria (5 minutos, 5 intentos), nunca en la cookie. */
  const challenges = new Map<string, { userId: string; key: string; expires: number; attempts: number }>();
  const createChallenge = (userId: string, key: string) => {
    const now = Date.now(); for (const [id, c] of challenges) if (c.expires < now) challenges.delete(id);
    if (challenges.size > 5000) throw new HttpError(429, 'Demasiadas solicitudes. Inténtalo más tarde.');
    const id = randomBytes(24).toString('base64url'); challenges.set(id, { userId, key, expires: now + 5 * 60_000, attempts: 0 }); return id;
  };
  const completeLogin = (req: Request, res: Response, user: WorkspaceUser, key: string, method: string) => {
    clearLoginFailures(key); startSession(req, res, user);
    recordSecurityEvent('login_succeeded', { id: user.id, name: user.displayName, ip: req.ip }, { id: user.id, name: user.username }, method === 'password' ? {} : { secondFactor: method });
    return sessionInfo(res);
  };
  app.post('/api/login', respondAsync(async (req, res): Promise<SessionInfo | TwoFactorChallenge> => {
    if (auth(res).open) return sessionInfo(res);
    const limiter = throttle(req);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 80) : '';
    const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
    const key = failureKey(username, req.ip || '');
    assertNotLocked(key);
    const user = username && candidate.length <= 1024 ? findUserForLogin(username) : undefined;
    const valid = user ? await verifyPassword(candidate, user.passwordHash) : (await verifyPassword(candidate.slice(0, 1024), await getDecoyHash()), false);
    if (!user || !valid) { limiter.fail(); recordSecurityEvent('login_failed', { id: '', name: '', ip: req.ip }, { id: user?.id, name: username.toLowerCase().slice(0, 40) }, { reason: user ? 'password' : 'unknown_user' }); return failLogin(req, key, 401, 'Usuario o contraseña incorrectos.', { id: user?.id, name: username.toLowerCase().slice(0, 40) }); }
    if (!user.active) { limiter.fail(); recordSecurityEvent('login_failed', { id: '', name: '', ip: req.ip }, { id: user.id, name: user.username }, { reason: 'inactive' }); throw new HttpError(403, 'Tu cuenta está desactivada. Contacta con un administrador del espacio.'); }
    limiter.clear();
    if (user.twoFactorEnabled) return { twoFactorRequired: true, challenge: createChallenge(user.id, key), displayName: user.displayName };
    return completeLogin(req, res, user, key, 'password');
  }));
  app.post('/api/login/2fa', respondAsync(async (req, res) => {
    const limiter = throttle(req);
    const id = typeof req.body?.challenge === 'string' ? req.body.challenge : '';
    const challenge = challenges.get(id);
    if (!challenge || challenge.expires < Date.now()) { challenges.delete(id); throw new HttpError(401, 'La verificación caducó. Vuelve a introducir tu usuario y contraseña.', 'CHALLENGE_EXPIRED'); }
    assertNotLocked(challenge.key);
    const user = getUser(challenge.userId);
    if (!user || !user.active) { challenges.delete(id); throw new HttpError(401, 'La verificación caducó. Vuelve a introducir tu usuario y contraseña.', 'CHALLENGE_EXPIRED'); }
    const result = verifySecondFactor(user.id, req.body?.code);
    if (!result.ok) {
      limiter.fail();
      recordSecurityEvent('two_factor_failed', { id: '', name: '', ip: req.ip }, { id: user.id, name: user.username }, { stage: 'login' });
      if (++challenge.attempts >= 5) challenges.delete(id);
      return failLogin(req, challenge.key, 401, 'El código no es correcto.', { id: user.id, name: user.username });
    }
    challenges.delete(id);
    if (result.method === 'recovery') recordSecurityEvent('recovery_code_used', { id: user.id, name: user.displayName, ip: req.ip }, { id: user.id, name: user.username }, { remaining: result.recoveryCodesLeft });
    return { ...completeLogin(req, res, getUser(user.id)!, challenge.key, result.method), ...(result.method === 'recovery' ? { recoveryCodesLeft: result.recoveryCodesLeft } : {}) };
  }));
  app.post('/api/logout', (req, res) => {
    const user = auth(res).user; deleteSession(cookieToken(req));
    if (user) recordSecurityEvent('logout', { id: user.id, name: user.displayName, ip: req.ip }, { id: user.id, name: user.username });
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' }); res.json({ ok: true });
  });
  app.post('/api/setup', respondAsync(async (req, res) => {
    if (!auth(res).open) throw new HttpError(409, 'El control de acceso ya está activado. Inicia sesión con tu cuenta.');
    if (!allowSetup) throw new HttpError(403, 'Este servidor no permite crear cuentas desde la interfaz. Configura APP_PASSWORD y reinícialo.');
    throttle(req);
    const user = await createFirstAdmin(req.body);
    startSession(req, res, user);
    return sessionInfo(res);
  }, 201));
  app.use('/api', (_req, res, next) => {
    if (!auth(res).open && !auth(res).user) {
      const expired = res.locals.sessionExpired as string | undefined;
      res.status(401).json(expired === 'idle' ? { error: 'Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.', code: 'SESSION_IDLE' } : { error: 'Inicia sesión para acceder a tu espacio de trabajo.', code: expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED' });
      return;
    }
    next();
  });
  app.put('/api/me/password', respondAsync(async (req, res) => {
    const { user, tokenHash } = auth(res); if (!user) throw new HttpError(400, 'Activa el control de acceso para gestionar contraseñas.');
    const updated = await changeOwnPassword(user.id, req.body, tokenHash, actorRef(req, res));
    res.locals.auth = { ...auth(res), user: updated } satisfies Auth;
    return sessionInfo(res);
  }));
  app.use('/api', (_req, res, next) => { if (auth(res).user?.mustChangePassword) { res.status(403).json({ error: 'Debes cambiar tu contraseña temporal antes de continuar.', code: 'PASSWORD_CHANGE_REQUIRED' }); return; } next(); });

  /* Verificación en dos pasos y sesiones de la propia cuenta (permitidas aunque la política exija activar 2FA). */
  const me = (res: Response) => { const { user } = auth(res); if (!user) throw new HttpError(400, 'Activa el control de acceso para usar la verificación en dos pasos.'); return user; };
  app.post('/api/me/2fa/setup', respondAsync(async (_req, res) => {
    const { secret, otpauthUri } = startTwoFactorSetup(me(res).id);
    const qrSvg = await QRCode.toString(otpauthUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1d3b30', light: '#ffffff' } });
    return { secret, otpauthUri, qrSvg };
  }));
  app.post('/api/me/2fa/enable', respond((req, res) => {
    const { codes, user } = enableTwoFactor(me(res).id, req.body?.code, actorRef(req, res));
    res.locals.auth = { ...auth(res), user } satisfies Auth;
    return { recoveryCodes: codes, session: sessionInfo(res) };
  }));
  app.post('/api/me/2fa/disable', respondAsync(async (req, res) => {
    if (requireAdminTwoFactor && me(res).role === 'admin') throw new HttpError(403, 'La política del espacio exige la verificación en dos pasos a los administradores.');
    const user = await disableTwoFactor(me(res).id, req.body ?? {}, actorRef(req, res));
    res.locals.auth = { ...auth(res), user } satisfies Auth;
    return sessionInfo(res);
  }));
  app.post('/api/me/2fa/recovery-codes', respond((req, res) => ({ recoveryCodes: regenerateRecoveryCodes(me(res).id, req.body?.code, actorRef(req, res)) })));
  app.get('/api/me/security', respond((_req, res) => { const user = getUser(me(res).id)!; return { twoFactorEnabled: user.twoFactorEnabled, recoveryCodesLeft: user.recoveryCodesLeft, passwordChangedAt: user.passwordChangedAt, idleMinutes: Math.round(sessionIdleMs() / 60_000), maxHours: Math.round(sessionMaxMs() / 3_600_000), requireAdminTwoFactor }; }));
  app.get('/api/me/sessions', respond((_req, res) => listOwnSessions(me(res).id, auth(res).tokenHash)));
  app.delete('/api/me/sessions/:id', respond((req, res) => ({ ok: true, revoked: revokeOwnSessions(me(res).id, req.params.id, auth(res).tokenHash, actorRef(req, res)) })));
  app.use('/api', (_req, res, next) => { if (twoFactorSetupRequired(auth(res).user)) { res.status(403).json({ error: 'La política del espacio exige que los administradores activen la verificación en dos pasos antes de continuar.', code: 'TWO_FACTOR_SETUP_REQUIRED' }); return; } next(); });
  app.use('/api', (req, res, next) => { const ref = actorRef(req, res); actorStore.run({ id: ref.id, name: ref.name }, next); });

  app.get('/api/users', requirePermission('users.manage'), respond(() => listUsers()));
  app.post('/api/users', requirePermission('users.manage'), respondAsync((req, res) => createUser(req.body, actorRef(req, res)), 201));
  app.put('/api/users/:id', requirePermission('users.manage'), respondAsync((req, res) => updateUser(req.params.id, req.body, actorRef(req, res))));
  app.delete('/api/users/:id/sessions', requirePermission('users.manage'), respond((req, res) => {
    const revoked = revokeUserSessions(req.params.id, actorRef(req, res));
    if (req.params.id === auth(res).user?.id) res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });
    return { ok: true, revoked };
  }));
  app.get('/api/security-events', requirePermission('users.manage'), respond(req => listSecurityEvents(Number(req.query.limit) || 100)));
  const scheduledBackups = options.scheduledBackups ?? false;
  app.get('/api/backups', requirePermission('users.manage'), respond(() => backupStatus(scheduledBackups)));
  app.post('/api/backups', requirePermission('users.manage'), respond((req, res) => {
    const info = createBackup(db);
    recordSecurityEvent('backup_created', actorRef(req, res), { name: info.name }, { encrypted: info.encrypted, size: info.size, removed: info.removed.length });
    return backupStatus(scheduledBackups);
  }, 201));
  app.get('/api/backups/:name', requirePermission('users.manage'), (req, res, next) => {
    const name = req.params.name;
    if (!isBackupName(name) || !listBackups().some(b => b.name === name)) { res.status(404).json({ error: 'Copia no encontrada.' }); return; }
    recordSecurityEvent('backup_downloaded', actorRef(req, res), { name }, {});
    res.download(path.join(backupDirectory(), name), name, { dotfiles: 'deny', headers: { 'Content-Type': 'application/octet-stream' } }, error => { if (error && !res.headersSent) next(error); });
  });

  app.get('/api/paper-standards', respond(() => PAPER_STANDARDS_LIST));
  app.get('/api/dashboard', respond(() => ({ stats: getDashboardStats(), recentInvoices: listInvoices().slice(0, 6) })));
  app.get('/api/supplier', respond(() => getSupplierProfile()));
  app.put('/api/supplier', requirePermission('supplier.write'), respond(req => updateSupplierProfile(req.body)));
  app.get('/api/goals', respond(() => getRevenueGoals()));
  app.put('/api/goals', requirePermission('supplier.write'), respond(req => saveRevenueGoals(req.body)));
  app.get('/api/clients', respond(() => listClients()));
  app.post('/api/clients', requirePermission('clients.write'), respond(req => saveClient({ ...req.body, id: undefined }), 201));
  app.put('/api/clients/:id', requirePermission('clients.write'), respond(req => saveClient({ ...req.body, id: req.params.id })));
  app.delete('/api/clients/:id', requirePermission('clients.write'), respond(req => { deleteClient(req.params.id); return { ok: true }; }));
  app.get('/api/contracts', respond(() => listContracts()));
  app.post('/api/contracts', requirePermission('contracts.write'), respond(req => saveContract({ ...req.body, id: undefined }), 201));
  app.put('/api/contracts/:id', requirePermission('contracts.write'), respond(req => saveContract({ ...req.body, id: req.params.id })));
  app.delete('/api/contracts/:id', requirePermission('contracts.write'), respond(req => { deleteContract(req.params.id); return { ok: true }; }));
  app.get('/api/catalog', respond(() => listServiceCatalog()));
  app.post('/api/catalog', requirePermission('catalog.write'), respond(req => saveServiceCatalogItem({ ...req.body, id: undefined }), 201));
  app.put('/api/catalog/:id', requirePermission('catalog.write'), respond(req => saveServiceCatalogItem({ ...req.body, id: req.params.id })));
  app.delete('/api/catalog/:id', requirePermission('catalog.write'), respond(req => { deleteServiceCatalogItem(req.params.id); return { ok: true }; }));
  app.get('/api/invoices', respond(() => listInvoices()));
  app.get('/api/invoices/:id', respond((req, res) => { const invoice = getInvoiceById(req.params.id); if (!invoice) { res.status(404).json({ error: 'Factura no encontrada.' }); return; } return invoice; }));
  app.post('/api/invoices', requirePermission('invoices.draft'), respond((req, res) => { if (req.body?.status && req.body.status !== 'borrador') assertCan(res, 'invoices.issue'); return saveInvoice({ ...req.body, id: undefined }); }, 201));
  app.put('/api/invoices/:id', requirePermission('invoices.draft'), respond((req, res) => { const existing = getInvoiceById(req.params.id); if ((existing && existing.status !== 'borrador') || (req.body?.status && req.body.status !== 'borrador')) assertCan(res, 'invoices.issue'); return saveInvoice({ ...req.body, id: req.params.id }); }));
  app.patch('/api/invoices/:id/status', requirePermission('invoices.issue'), respond(req => updateInvoiceStatus(req.params.id, req.body?.status)));
  app.post('/api/invoices/:id/sign', requirePermission('invoices.sign'), respond(req => signInvoiceByClient(req.params.id, req.body)));
  app.get('/api/invoices/:id/integrity', respond(req => getInvoiceIntegrity(req.params.id)));
  app.get('/api/invoices/:id/events', respond(req => getInvoiceEvents(req.params.id)));
  app.delete('/api/invoices/:id', requirePermission('invoices.delete'), respond(req => { deleteInvoice(req.params.id); return { ok: true }; }));
  app.get('/api/invoices/:id/export/:format', async (req, res, next) => {
    try {
      const invoice = getInvoiceById(req.params.id); if (!invoice) { res.status(404).json({ error: 'Factura no encontrada.' }); return; }
      const format = req.params.format.toLowerCase(); const paper = String(req.query.paper || invoice.preferredPaperSize).toUpperCase(); const orientation = String(req.query.orientation || invoice.preferredOrientation);
      if (!['pdf', 'docx', 'xlsx'].includes(format)) { res.status(400).json({ error: 'Formato no soportado. Usa pdf, docx o xlsx.' }); return; }
      if (!Object.hasOwn(INTERNATIONAL_PAPER_STANDARDS, paper) || !['portrait', 'landscape'].includes(orientation)) { res.status(400).json({ error: 'Formato de hoja u orientación no válidos.' }); return; }
      if (invoice.signatureStatus === 'firmada_cliente' && !getInvoiceIntegrity(invoice.id).matches) { res.status(409).json({ error: 'La integridad del contenido firmado no coincide. Revisa el registro original.' }); return; }
      const paperSize = paper as PaperSizeId, pageOrientation = orientation as PaperOrientation;
      const buffer = format === 'pdf' ? await generateInvoicePdfBuffer(invoice, paperSize, pageOrientation) : format === 'docx' ? await generateInvoiceDocxBuffer(invoice, paperSize, pageOrientation) : await generateInvoiceXlsxBuffer(invoice, paperSize, pageOrientation);
      const types: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      const filename = `${sanitizeFilename(invoice.invoiceNumber)}_${paper}_${orientation === 'landscape' ? 'Horizontal' : 'Vertical'}.${format}`;
      res.setHeader('Content-Type', types[format]); res.setHeader('Content-Disposition', `${format === 'pdf' && req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${filename}"`); res.send(buffer);
    } catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso de API no encontrado.' }));
  const errorHandler: ErrorRequestHandler = (error: Error & { type?: string; code?: string; status?: number }, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof HttpError || (typeof error.status === 'number' && error.status >= 400 && error.status < 500 && !error.type)) { res.status(error.status!).json({ error: error.message, ...(error.code ? { code: error.code } : {}) }); return; }
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'La solicitud supera el límite de 4 MB.' }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'El cuerpo JSON de la solicitud no es válido.' }); return; }
    if (error.code?.includes('CONSTRAINT_FOREIGNKEY') || error.message.includes('FOREIGN KEY constraint')) { res.status(409).json({ error: 'No se puede eliminar un Cliente con contratos o facturas asociados.' }); return; }
    if (error.message.includes('UNIQUE constraint')) { res.status(409).json({ error: 'Este número o código ya existe.' }); return; }
    if (error.code?.startsWith('ERR_SQLITE')) { console.error('Error de base de datos:', error.code); res.status(500).json({ error: 'No se pudo completar la operación de almacenamiento.' }); return; }
    res.status(/no encontrad[oa]/i.test(error.message) ? 404 : 400).json({ error: error.message || 'No se pudo completar la solicitud.' });
  };
  app.use(errorHandler);
  return app;
}
