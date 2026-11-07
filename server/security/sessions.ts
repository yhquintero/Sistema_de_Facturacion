import { routeParam } from '../routeParam';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import QRCode from 'qrcode';
import type { Express, Request, Response, NextFunction } from 'express';
import type { RuntimeConfig } from '../config';
import { getWorkspaceInfo } from '../db';
import { actorStore } from '../actor';
import { PERMISSIONS, ROLE_PERMISSIONS, type SessionInfo, type TwoFactorChallenge, type WorkspaceUser } from '../../shared/permissions';
import { bootstrapAdminFromHash, changeOwnPassword, clearLoginFailures, createFirstAdmin, createSession, createUser, deleteSession, disableTwoFactor, enableTwoFactor, failureKey, findUserForLogin, getDecoyHash, getUser, hasUsers, inspectSession, listOwnSessions, listSecurityEvents, listUsers, loginLockRemainingMs, recordSecurityEvent, regenerateRecoveryCodes, registerLoginFailure, resolveSession, revokeOwnSessions, revokeUserSessions, sessionIdleMs, sessionMaxMs, startTwoFactorSetup, toSessionUser, updateUser, verifyPassword, verifySecondFactor, type ActorRef } from '../users';
import { backupStatus, createBackup, isBackupName, listBackups } from '../backups';
import { backupDirectory } from '../paths';
import { loadCredential } from './password';
import { createLimiter, isWrite } from './http';
import { peerId, securityLog } from './log';
import { auth, requirePermission, type Auth } from './authorization';
import { publishChange } from '../realtime';
const digest = (value: string) => createHash('sha256').update(value).digest();
const actorRef = (req: Request, res: Response): ActorRef => ({ id: auth(res).user?.id || '', name: auth(res).user?.displayName || 'Modo abierto', ip: peerId(req) });
const failure = (status: number, message: string, code = '') => Object.assign(new Error(message), { status, code });
const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
export type SessionOptions = { allowSetup?: boolean; adminUsername?: string; /** Exige 2FA a los administradores (REQUIRE_ADMIN_2FA=true). */ requireAdminTwoFactor?: boolean; /** Copias diarias programadas activas (informativo para el panel). */ scheduledBackups?: boolean };
export function installSessions(app: Express, config: RuntimeConfig, explicitPassword?: string, options: SessionOptions = {}) {
  const credential = loadCredential(config, explicitPassword);
  if (!hasUsers() && credential.enabled) bootstrapAdminFromHash(credential.bootstrapHash(), options.adminUsername || process.env.ADMIN_USERNAME || 'admin');
  if (!hasUsers() && !getWorkspaceInfo().demo) throw new Error('No se permite acceso sin autenticación a un espacio no demostrativo.');
  const allowSetup = options.allowSetup ?? !config.production;
  const requireAdminTwoFactor = options.requireAdminTwoFactor ?? process.env.REQUIRE_ADMIN_2FA === 'true';
  const twoFactorSetupRequired = (user: WorkspaceUser | null) => !!user && requireAdminTwoFactor && user.role === 'admin' && !user.twoFactorEnabled;
  const accountLoginLimit = createLimiter(10,15*60_000), loginLimit = createLimiter(10, 15 * 60_000), globalLoginLimit = createLimiter(60, 60_000, 1); let activeKdf = 0;
  const name = (req: Request) => req.secure ? '__Host-nexo_session' : 'nexo_session';
  const token = (req: Request) => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(name(req) + '='))?.slice(name(req).length + 1) || '';
  const loginKey = (req: Request) => peerId(req) + ':' + digest(typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0,80) : '').toString('hex');
  const cookieOptions = (req: Request) => ({ httpOnly: true, sameSite: 'strict' as const, secure: req.secure, maxAge: sessionMaxMs(), path: '/' });
  const csrf = (req: Request) => resolveSession(token(req), false)?.csrfToken || '';
  const check = (req: Request, touch = true) => { if (!hasUsers()) return true; const session=resolveSession(token(req),touch); return !!session && !session.user.mustChangePassword; };
  const sessionInfo = (req: Request, res: Response): SessionInfo => ({ protected: !auth(res).open, authenticated: auth(res).open || !!auth(res).user, ...getWorkspaceInfo(), user: auth(res).user ? toSessionUser(auth(res).user!) : null, permissions: auth(res).permissions, setupAvailable: auth(res).open && allowSetup, csrfToken: csrf(req), ...idleInfo(res), ...(twoFactorSetupRequired(auth(res).user) ? { twoFactorSetupRequired: true } : {}) });
  /** Minutos de inactividad permitidos y segundos restantes según la última actividad registrada en el servidor. */
  const idleInfo = (res: Response) => { const idle = sessionIdleMs(); if (!auth(res).user || !idle) return { idleMinutes: 0 }; const last = Number(res.locals.lastUsedAt) || Date.now(); return { idleMinutes: Math.round(idle / 60_000), idleRemainingSeconds: Math.max(0, Math.floor((last + idle - Date.now()) / 1000)) }; };
  const startSession = (req: Request, res: Response, user: WorkspaceUser) => {
    deleteSession(token(req)); const session = createSession(user.id, { ip: peerId(req) });
    res.cookie(name(req), session.token, cookieOptions(req));
    res.locals.auth = { open: false, user, tokenHash: session.tokenHash, permissions: [...ROLE_PERMISSIONS[user.role]] } satisfies Auth; res.locals.lastUsedAt = Date.now();
    return { ...sessionInfo(req, res), csrfToken: session.csrfToken };
  };
  const asyncRoute = (action: (req: Request,res: Response) => Promise<unknown>, status = 200, changed = false) => (req: Request,res: Response,next: NextFunction) => {
    if (activeKdf >= 2) { res.setHeader('Retry-After','2'); res.status(429).json({error:'Acceso ocupado. Reintenta en unos segundos.'}); return; }
    activeKdf++;
    void action(req,res).then(value => { if (!res.headersSent) res.status(status).json(value); if (changed) publishChange('users'); }).catch(next).finally(() => activeKdf--);
  };
  app.use('/api', (req,res,next) => {
    // GET /api/session?probe=1 consulta el estado sin contar como actividad (aviso de inactividad entre pestañas).
    const resolved = inspectSession(token(req), { touch: !(req.method === 'GET' && req.path === '/session' && req.query.probe === '1') });
    const session = resolved && 'tokenHash' in resolved ? resolved : null;
    if (session) res.locals.lastUsedAt = session.lastUsedAt;
    if (resolved && 'expired' in resolved) res.locals.sessionExpired = resolved.expired;
    res.locals.auth = { open: !hasUsers(), user: session?.user || null, tokenHash: session?.tokenHash || '', permissions: !hasUsers() ? PERMISSIONS.filter(p => p !== 'users.manage') : session ? [...ROLE_PERMISSIONS[session.user.role]] : [] } satisfies Auth;
    next();
  });
  app.get('/api/session', (req,res) => res.json({ ...sessionInfo(req,res), ...(res.locals.sessionExpired ? { expiredReason: res.locals.sessionExpired } : {}) }));
  /* Bloqueo persistente por usuario + conexión: LOGIN_MAX_ATTEMPTS fallos (contraseña o código) bloquean LOGIN_LOCK_MINUTES. */
  const assertNotLocked = (key: string) => { const remaining = loginLockRemainingMs(key); if (remaining) throw failure(429, `Acceso bloqueado temporalmente por intentos fallidos. Espera ${minutes(remaining)} min antes de volver a intentar.`, 'LOGIN_LOCKED'); };
  const failLogin = (req: Request, key: string, status: number, message: string, target: { id?: string; name: string }): never => {
    const { remaining, lockedMs } = registerLoginFailure(key);
    if (lockedMs) { recordSecurityEvent('login_locked', { id: '', name: '', ip: peerId(req) }, target, { minutes: minutes(lockedMs) }); securityLog('login_locked', { peer: peerId(req) }); throw failure(429, `Demasiados intentos fallidos. El acceso queda bloqueado ${minutes(lockedMs)} minutos.`, 'LOGIN_LOCKED'); }
    throw failure(status, `${message} ${remaining === 1 ? 'Te queda 1 intento' : `Te quedan ${remaining} intentos`} antes del bloqueo temporal.`);
  };
  /* Segundo paso pendiente: reto efímero en memoria (5 minutos, 5 intentos), nunca en la cookie. */
  const challenges = new Map<string, { userId: string; key: string; expires: number; attempts: number }>();
  const createChallenge = (userId: string, key: string) => {
    const now = Date.now(); for (const [id, c] of challenges) if (c.expires < now) challenges.delete(id);
    if (challenges.size > 5000) throw failure(429, 'Servicio ocupado. Inténtalo más tarde.');
    const id = randomBytes(24).toString('base64url'); challenges.set(id, { userId, key, expires: now + 5 * 60_000, attempts: 0 }); return id;
  };
  const completeLogin = (req: Request, res: Response, user: WorkspaceUser, key: string, method: string) => {
    clearLoginFailures(key); loginLimit.reset(peerId(req)); accountLoginLimit.reset(loginKey(req));
    const result = startSession(req, res, user);
    securityLog('login_success', { requestId: res.locals.requestId, peer: peerId(req), actor: user.id });
    recordSecurityEvent('login_succeeded', actorRef(req, res), { id: user.id, name: user.username }, method === 'password' ? {} : { secondFactor: method });
    return result;
  };
  app.post('/api/login', (req,res,next) => { if (loginLimit(peerId(req),res) && accountLoginLimit(loginKey(req),res) && globalLoginLimit('global',res)) next(); }, asyncRoute(async (req,res) => {
    if (auth(res).open) return sessionInfo(req,res);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0,80) : '';
    const value = typeof req.body?.password === 'string' && req.body.password.length <= 1024 ? req.body.password : '';
    const key = failureKey(username, peerId(req)); assertNotLocked(key);
    const user = username ? findUserForLogin(username) : undefined;
    const valid = await verifyPassword(value, user?.passwordHash || await getDecoyHash());
    if (!user || !valid || !user.active) {
      securityLog('login_failed',{ requestId:res.locals.requestId,peer:peerId(req) });
      recordSecurityEvent('login_failed', {id:'',name:'',ip:peerId(req)}, {id:user?.id,name:username.toLowerCase().slice(0,40)}, {reason:!user?'unknown_user':!valid?'password':'inactive'});
      if (user && valid && !user.active) throw failure(403,'Tu cuenta está desactivada. Contacta con un administrador del espacio.');
      return failLogin(req, key, 401, 'Usuario o contraseña incorrectos.', { id: user?.id, name: username.toLowerCase().slice(0, 40) });
    }
    if (user.twoFactorEnabled) return { twoFactorRequired: true, challenge: createChallenge(user.id, key), displayName: user.displayName } satisfies TwoFactorChallenge;
    return completeLogin(req, res, user, key, 'password');
  }));
  app.post('/api/login/2fa', (req,res,next) => { if (loginLimit(peerId(req),res) && globalLoginLimit('global',res)) next(); }, (req,res,next) => {
    try {
      const id = typeof req.body?.challenge === 'string' ? req.body.challenge : '';
      const challenge = challenges.get(id); const user = challenge ? getUser(challenge.userId) : undefined;
      if (!challenge || challenge.expires < Date.now() || !user?.active) { challenges.delete(id); throw failure(401, 'La verificación caducó. Vuelve a introducir tu usuario y contraseña.', 'CHALLENGE_EXPIRED'); }
      assertNotLocked(challenge.key);
      const result = verifySecondFactor(user.id, req.body?.code);
      if (!result.ok) {
        securityLog('two_factor_failed', { requestId: res.locals.requestId, peer: peerId(req) });
        recordSecurityEvent('two_factor_failed', { id: '', name: '', ip: peerId(req) }, { id: user.id, name: user.username }, { stage: 'login' });
        if (++challenge.attempts >= 5) challenges.delete(id);
        return failLogin(req, challenge.key, 401, 'El código no es correcto.', { id: user.id, name: user.username });
      }
      challenges.delete(id);
      if (result.method === 'recovery') recordSecurityEvent('recovery_code_used', { id: user.id, name: user.displayName, ip: peerId(req) }, { id: user.id, name: user.username }, { remaining: result.recoveryCodesLeft });
      res.json({ ...completeLogin(req, res, getUser(user.id)!, challenge.key, result.method), ...(result.method === 'recovery' ? { recoveryCodesLeft: result.recoveryCodesLeft } : {}) });
    } catch (error) { next(error); }
  });
  app.post('/api/setup', (req,res,next) => { if (!auth(res).open) { next(failure(409,'El control de acceso ya está activado. Inicia sesión con tu cuenta.')); return; } if (!allowSetup) { next(failure(403,'Configura la cuenta inicial desde la consola del servidor.')); return; } if (loginLimit(peerId(req),res) && globalLoginLimit('global',res)) next(); }, asyncRoute(async (req,res) => startSession(req,res,await createFirstAdmin(req.body)),201,true));
  // Authentication and CSRF apply to all account, commercial and fiscal mutations.
  app.use('/api', (req,res,next) => {
    if (!auth(res).open && !auth(res).user) { const expired = res.locals.sessionExpired as string | undefined; next(expired === 'idle' ? failure(401,'Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.','SESSION_IDLE') : failure(401,'Inicia sesión para acceder a tu espacio de trabajo.', expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED')); return; }
    res.locals.authenticated = !auth(res).open;
    if (!auth(res).open && isWrite(req) && (!req.get('X-CSRF-Token') || !timingSafeEqual(digest(req.get('X-CSRF-Token') || ''),digest(csrf(req))))) {
      securityLog('csrf_rejected',{requestId:res.locals.requestId,peer:peerId(req)}); next(failure(403,'Token de seguridad ausente o caducado. Recarga la sesión.')); return;
    }
    next();
  });
  app.post('/api/logout', (req,res) => { const user=auth(res).user; deleteSession(token(req)); res.setHeader('Clear-Site-Data','"cache", "storage"'); const {maxAge:_age,...clearing}=cookieOptions(req);res.clearCookie(name(req),clearing); if(user)recordSecurityEvent('logout',actorRef(req,res),{id:user.id,name:user.username}); securityLog('logout',{requestId:res.locals.requestId,peer:peerId(req)});res.json({ok:true}); });
  app.put('/api/me/password',asyncRoute(async(req,res)=>{ const current=auth(res); if(!current.user)throw failure(400,'Activa el control de acceso para gestionar contraseñas.'); const user=await changeOwnPassword(current.user.id,req.body,current.tokenHash,actorRef(req,res));res.locals.auth={...current,user};return sessionInfo(req,res);},200,true));
  app.use('/api', (_req,res,next)=>{ if(auth(res).user?.mustChangePassword){next(failure(403,'Debes cambiar tu contraseña temporal antes de continuar.','PASSWORD_CHANGE_REQUIRED'));return;}next(); });
  /* Verificación en dos pasos y sesiones de la propia cuenta (permitidas aunque la política exija activar 2FA). */
  const me = (res: Response) => { const { user } = auth(res); if (!user) throw failure(400, 'Activa el control de acceso para usar la verificación en dos pasos.'); return user; };
  const route = (action: (req: Request, res: Response) => unknown | Promise<unknown>, status = 200) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => action(req, res)).then(value => { if (!res.headersSent) res.status(status).json(value); }).catch(next); };
  app.post('/api/me/2fa/setup', route(async (_req, res) => {
    const { secret, otpauthUri } = startTwoFactorSetup(me(res).id);
    const qrSvg = await QRCode.toString(otpauthUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1d3b30', light: '#ffffff' } });
    return { secret, otpauthUri, qrSvg };
  }));
  app.post('/api/me/2fa/enable', route((req, res) => {
    const { codes, user } = enableTwoFactor(me(res).id, req.body?.code, actorRef(req, res));
    res.locals.auth = { ...auth(res), user } satisfies Auth; publishChange('users');
    return { recoveryCodes: codes, session: sessionInfo(req, res) };
  }));
  app.post('/api/me/2fa/disable', asyncRoute(async (req, res) => {
    if (requireAdminTwoFactor && me(res).role === 'admin') throw failure(403, 'La política del espacio exige la verificación en dos pasos a los administradores.');
    const user = await disableTwoFactor(me(res).id, req.body ?? {}, actorRef(req, res));
    res.locals.auth = { ...auth(res), user } satisfies Auth;
    return sessionInfo(req, res);
  }, 200, true));
  app.post('/api/me/2fa/recovery-codes', route((req, res) => ({ recoveryCodes: regenerateRecoveryCodes(me(res).id, req.body?.code, actorRef(req, res)) })));
  app.get('/api/me/security', route((_req, res) => { const user = getUser(me(res).id)!; return { twoFactorEnabled: user.twoFactorEnabled, recoveryCodesLeft: user.recoveryCodesLeft, passwordChangedAt: user.passwordChangedAt, idleMinutes: Math.round(sessionIdleMs() / 60_000), maxHours: Math.round(sessionMaxMs() / 3_600_000), requireAdminTwoFactor }; }));
  app.get('/api/me/sessions', route((_req, res) => listOwnSessions(me(res).id, auth(res).tokenHash)));
  app.delete('/api/me/sessions/:id', route((req, res) => ({ ok: true, revoked: revokeOwnSessions(me(res).id, routeParam(req, 'id'), auth(res).tokenHash, actorRef(req, res)) })));
  app.use('/api', (_req, res, next) => { if (twoFactorSetupRequired(auth(res).user)) { next(failure(403, 'La política del espacio exige que los administradores activen la verificación en dos pasos antes de continuar.', 'TWO_FACTOR_SETUP_REQUIRED')); return; } next(); });
  app.use('/api',(req,res,next)=>{const actor=actorRef(req,res);actorStore.run({id:actor.id,name:actor.name},next);});
  app.get('/api/users',requirePermission('users.manage'),(_req,res)=>res.json(listUsers()));
  app.post('/api/users',requirePermission('users.manage'),asyncRoute((req,res)=>createUser(req.body,actorRef(req,res)),201,true));
  app.put('/api/users/:id',requirePermission('users.manage'),asyncRoute((req,res)=>updateUser(routeParam(req, 'id'),req.body,actorRef(req,res)),200,true));
  app.delete('/api/users/:id/sessions',requirePermission('users.manage'),(req,res,next)=>{try{const revoked=revokeUserSessions(routeParam(req, 'id'),actorRef(req,res));if(routeParam(req, 'id')===auth(res).user?.id){const{maxAge:_age,...clearing}=cookieOptions(req);res.clearCookie(name(req),clearing);}res.json({ok:true,revoked});publishChange('users');}catch(error){next(error);}});
  /* Copias de seguridad cifradas (administración). */
  const scheduledBackups = options.scheduledBackups ?? false;
  app.get('/api/backups', requirePermission('users.manage'), route(() => backupStatus(scheduledBackups)));
  app.post('/api/backups', requirePermission('users.manage'), route(async (req, res) => {
    const info = await createBackup();
    recordSecurityEvent('backup_created', actorRef(req, res), { name: info.name }, { encrypted: true, size: info.size, removed: info.removed.length });
    return backupStatus(scheduledBackups);
  }, 201));
  app.get('/api/backups/:name', requirePermission('users.manage'), (req, res, next) => {
    const file = typeof req.params.name === 'string' ? req.params.name : '';
    if (!isBackupName(file) || !listBackups().some(b => b.name === file)) { res.status(404).json({ error: 'Copia no encontrada.' }); return; }
    recordSecurityEvent('backup_downloaded', actorRef(req, res), { name: file }, {});
    res.download(path.join(backupDirectory(), file), file, { dotfiles: 'deny', headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } }, error => { if (error && !res.headersSent) next(error); });
  });
  app.get('/api/security-events',requirePermission('users.manage'),(req,res)=>res.json(listSecurityEvents(Number(req.query.limit)||100)));
  return { check, get enabled() { return hasUsers(); }, get credentialKind() { return hasUsers() ? 'personal-accounts' : 'demo'; }, sessionCount: () => Number((listUsers()).reduce((n,user)=>n+user.activeSessions,0)) };
}
