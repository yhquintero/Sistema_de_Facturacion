import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { INTERNATIONAL_PAPER_STANDARDS, PAPER_STANDARDS_LIST, type PaperOrientation, type PaperSizeId } from '../shared/paperStandards';
import { deleteClient, deleteContract, deleteInvoice, deleteServiceCatalogItem, getDashboardStats, getInvoiceById, getInvoiceEvents, getInvoiceIntegrity, getSupplierProfile, getWorkspaceInfo, listClients, listContracts, listInvoices, listServiceCatalog, saveClient, saveContract, saveInvoice, saveServiceCatalogItem, signInvoiceByClient, updateInvoiceStatus, updateSupplierProfile } from './db';
import { generateInvoicePdfBuffer } from './exporters/pdfExporter';
import { generateInvoiceDocxBuffer } from './exporters/docxExporter';
import { generateInvoiceXlsxBuffer } from './exporters/xlsxExporter';
import { sanitizeFilename } from './exporters/formatHelpers';

import { actorStore } from './actor';
import { PERMISSIONS, PERMISSION_LABELS, ROLE_INFO, ROLE_PERMISSIONS, type Permission, type SessionInfo } from '../shared/permissions';
import { bootstrapAdminFromPassword, changeOwnPassword, createFirstAdmin, createSession, createUser, deleteSession, findUserForLogin, getDecoyHash, hasUsers, listSecurityEvents, listUsers, recordSecurityEvent, resolveSession, revokeUserSessions, SESSION_TTL_MS, toSessionUser, updateUser, verifyPassword, type ActorRef } from './users';
import type { WorkspaceUser } from '../shared/permissions';

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

export function createApp(options: { password?: string; allowSetup?: boolean; adminUsername?: string } = {}) {
  const app = express(); const password = options.password ?? process.env.APP_PASSWORD ?? '';
  if (password && password.length < 12) throw new Error('APP_PASSWORD debe tener al menos 12 caracteres.');
  const allowSetup = options.allowSetup ?? process.env.NODE_ENV !== 'production';
  // Migración: APP_PASSWORD crea el primer administrador si todavía no hay cuentas.
  bootstrapAdminFromPassword(password, options.adminUsername ?? process.env.ADMIN_USERNAME ?? 'admin');
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.get('host')) { res.status(403).json({ error: 'Origen de solicitud no autorizado.' }); return; } } catch { res.status(403).json({ error: 'Origen no válido.' }); return; }
    }
    next();
  });
  // Resuelve la sesión en cada solicitud: el rol y el estado de la cuenta se leen siempre de la base.
  app.use('/api', (req, res, next) => {
    if (!hasUsers()) { res.locals.auth = { open: true, user: null, tokenHash: '', permissions: OPEN_MODE_PERMISSIONS } satisfies Auth; next(); return; }
    const session = resolveSession(cookieToken(req));
    res.locals.auth = { open: false, user: session?.user ?? null, tokenHash: session?.tokenHash ?? '', permissions: session ? [...ROLE_PERMISSIONS[session.user.role]] : [] } satisfies Auth;
    next();
  });
  const sessionInfo = (res: Response): SessionInfo => { const a = auth(res); return { protected: !a.open, authenticated: a.open || !!a.user, ...getWorkspaceInfo(), user: a.user ? toSessionUser(a.user) : null, permissions: a.permissions, setupAvailable: a.open && allowSetup }; };
  const setSessionCookie = (req: Request, res: Response, token: string) => res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_TTL_MS, path: '/' });
  const startSession = (req: Request, res: Response, user: WorkspaceUser) => { const { token, tokenHash } = createSession(user.id, { ip: req.ip, userAgent: req.get('user-agent') }); setSessionCookie(req, res, token); res.locals.auth = { open: false, user, tokenHash, permissions: [...ROLE_PERMISSIONS[user.role]] } satisfies Auth; };
  const attempts = new Map<string, { count: number; reset: number }>();
  const throttle = (req: Request) => {
    const now = Date.now(); const key = req.ip || 'unknown';
    for (const [ip, attempt] of attempts) if (attempt.reset < now) attempts.delete(ip);
    if (attempts.size > 5000) throw new HttpError(429, 'Demasiadas solicitudes. Inténtalo más tarde.');
    const attempt = attempts.get(key) || { count: 0, reset: now + 15 * 60_000 };
    if (attempt.count >= 10) throw new HttpError(429, 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.');
    return { fail: () => { attempt.count++; attempts.set(key, attempt); }, clear: () => attempts.delete(key) };
  };

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Nexo · Sistema de Facturación (Web, Servidor, Móvil)', timestamp: new Date().toISOString(), supportedFormats: ['pdf', 'docx', 'xlsx'], paperStandards: PAPER_STANDARDS_LIST.map(p => p.id) }));
  app.get('/api/session', (_req, res) => res.json(sessionInfo(res)));
  app.post('/api/login', respondAsync(async (req, res) => {
    if (auth(res).open) return sessionInfo(res);
    const limiter = throttle(req);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 80) : '';
    const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = username && candidate.length <= 1024 ? findUserForLogin(username) : undefined;
    const valid = user ? await verifyPassword(candidate, user.passwordHash) : (await verifyPassword(candidate.slice(0, 1024), await getDecoyHash()), false);
    if (!user || !valid) { limiter.fail(); recordSecurityEvent('login_failed', { id: '', name: '', ip: req.ip }, { id: user?.id, name: username.toLowerCase().slice(0, 40) }, { reason: user ? 'password' : 'unknown_user' }); throw new HttpError(401, 'Usuario o contraseña incorrectos.'); }
    if (!user.active) { limiter.fail(); recordSecurityEvent('login_failed', { id: '', name: '', ip: req.ip }, { id: user.id, name: user.username }, { reason: 'inactive' }); throw new HttpError(403, 'Tu cuenta está desactivada. Contacta con un administrador del espacio.'); }
    limiter.clear(); startSession(req, res, user);
    recordSecurityEvent('login_succeeded', { id: user.id, name: user.displayName, ip: req.ip }, { id: user.id, name: user.username });
    return sessionInfo(res);
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
  app.use('/api', (_req, res, next) => { if (!auth(res).open && !auth(res).user) { res.status(401).json({ error: 'Inicia sesión para acceder a tu espacio de trabajo.' }); return; } next(); });
  app.put('/api/me/password', respondAsync(async (req, res) => {
    const { user, tokenHash } = auth(res); if (!user) throw new HttpError(400, 'Activa el control de acceso para gestionar contraseñas.');
    const updated = await changeOwnPassword(user.id, req.body, tokenHash, actorRef(req, res));
    res.locals.auth = { ...auth(res), user: updated } satisfies Auth;
    return sessionInfo(res);
  }));
  app.use('/api', (_req, res, next) => { if (auth(res).user?.mustChangePassword) { res.status(403).json({ error: 'Debes cambiar tu contraseña temporal antes de continuar.', code: 'PASSWORD_CHANGE_REQUIRED' }); return; } next(); });
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

  app.get('/api/paper-standards', respond(() => PAPER_STANDARDS_LIST));
  app.get('/api/dashboard', respond(() => ({ stats: getDashboardStats(), recentInvoices: listInvoices().slice(0, 6) })));
  app.get('/api/supplier', respond(() => getSupplierProfile()));
  app.put('/api/supplier', requirePermission('supplier.write'), respond(req => updateSupplierProfile(req.body)));
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
