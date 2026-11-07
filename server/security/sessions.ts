import { createHash, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import type { RuntimeConfig } from '../config';
import { getWorkspaceInfo } from '../db';
import { actorStore } from '../actor';
import { PERMISSIONS, ROLE_PERMISSIONS, type SessionInfo, type WorkspaceUser } from '../../shared/permissions';
import { bootstrapAdminFromHash, changeOwnPassword, createFirstAdmin, createSession, createUser, deleteSession, findUserForLogin, getDecoyHash, hasUsers, listSecurityEvents, listUsers, recordSecurityEvent, resolveSession, revokeUserSessions, toSessionUser, updateUser, verifyPassword, type ActorRef } from '../users';
import { loadCredential } from './password';
import { createLimiter, isWrite } from './http';
import { peerId, securityLog } from './log';
import { auth, requirePermission, type Auth } from './authorization';
import { publishChange } from '../realtime';
const digest = (value: string) => createHash('sha256').update(value).digest();
const actorRef = (req: Request, res: Response): ActorRef => ({ id: auth(res).user?.id || '', name: auth(res).user?.displayName || 'Modo abierto', ip: peerId(req) });
const failure = (status: number, message: string, code = '') => Object.assign(new Error(message), { status, code });
export function installSessions(app: Express, config: RuntimeConfig, explicitPassword?: string, options: { allowSetup?: boolean; adminUsername?: string } = {}) {
  const credential = loadCredential(config, explicitPassword);
  if (!hasUsers() && credential.enabled) bootstrapAdminFromHash(credential.bootstrapHash(), options.adminUsername || process.env.ADMIN_USERNAME || 'admin');
  if (!hasUsers() && !getWorkspaceInfo().demo) throw new Error('No se permite acceso sin autenticación a un espacio no demostrativo.');
  const allowSetup = options.allowSetup ?? !config.production;
  const accountLoginLimit = createLimiter(10,15*60_000), loginLimit = createLimiter(10, 15 * 60_000), globalLoginLimit = createLimiter(60, 60_000, 1); let activeKdf = 0;
  const name = (req: Request) => req.secure ? '__Host-nexo_session' : 'nexo_session';
  const token = (req: Request) => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(name(req) + '='))?.slice(name(req).length + 1) || '';
  const loginKey = (req: Request) => peerId(req) + ':' + digest(typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0,80) : '').toString('hex');
  const cookieOptions = (req: Request) => ({ httpOnly: true, sameSite: 'strict' as const, secure: req.secure, maxAge: 8 * 60 * 60_000, path: '/' });
  const csrf = (req: Request) => resolveSession(token(req), false)?.csrfToken || '';
  const check = (req: Request, touch = true) => { if (!hasUsers()) return true; const session=resolveSession(token(req),touch); return !!session && !session.user.mustChangePassword; };
  const sessionInfo = (req: Request, res: Response): SessionInfo => ({ protected: !auth(res).open, authenticated: auth(res).open || !!auth(res).user, ...getWorkspaceInfo(), user: auth(res).user ? toSessionUser(auth(res).user!) : null, permissions: auth(res).permissions, setupAvailable: auth(res).open && allowSetup, csrfToken: csrf(req) });
  const startSession = (req: Request, res: Response, user: WorkspaceUser) => {
    deleteSession(token(req)); const session = createSession(user.id, { ip: peerId(req) });
    res.cookie(name(req), session.token, cookieOptions(req));
    res.locals.auth = { open: false, user, tokenHash: session.tokenHash, permissions: [...ROLE_PERMISSIONS[user.role]] } satisfies Auth;
    return { ...sessionInfo(req, res), csrfToken: session.csrfToken };
  };
  const asyncRoute = (action: (req: Request,res: Response) => Promise<unknown>, status = 200, changed = false) => (req: Request,res: Response,next: NextFunction) => {
    if (activeKdf >= 2) { res.setHeader('Retry-After','2'); res.status(429).json({error:'Acceso ocupado. Reintenta en unos segundos.'}); return; }
    activeKdf++;
    void action(req,res).then(value => { if (!res.headersSent) res.status(status).json(value); if (changed) publishChange('users'); }).catch(next).finally(() => activeKdf--);
  };
  app.use('/api', (req,res,next) => {
    const session = resolveSession(token(req));
    res.locals.auth = { open: !hasUsers(), user: session?.user || null, tokenHash: session?.tokenHash || '', permissions: !hasUsers() ? PERMISSIONS.filter(p => p !== 'users.manage') : session ? [...ROLE_PERMISSIONS[session.user.role]] : [] } satisfies Auth;
    next();
  });
  app.get('/api/session', (req,res) => res.json(sessionInfo(req,res)));
  app.post('/api/login', (req,res,next) => { if (loginLimit(peerId(req),res) && accountLoginLimit(loginKey(req),res) && globalLoginLimit('global',res)) next(); }, asyncRoute(async (req,res) => {
    if (auth(res).open) return sessionInfo(req,res);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0,80) : '';
    const value = typeof req.body?.password === 'string' && req.body.password.length <= 1024 ? req.body.password : '';
    const user = username ? findUserForLogin(username) : undefined;
    const valid = await verifyPassword(value, user?.passwordHash || await getDecoyHash());
    if (!user || !valid || !user.active) {
      securityLog('login_failed',{ requestId:res.locals.requestId,peer:peerId(req) });
      recordSecurityEvent('login_failed', {id:'',name:'',ip:peerId(req)}, {id:user?.id,name:username.toLowerCase().slice(0,40)}, {reason:!user?'unknown_user':!valid?'password':'inactive'});
      if (user && valid && !user.active) throw failure(403,'Tu cuenta está desactivada. Contacta con un administrador del espacio.');
      throw failure(401,'Usuario o contraseña incorrectos.');
    }
    loginLimit.reset(peerId(req)); accountLoginLimit.reset(loginKey(req));
    const result = startSession(req,res,user);
    securityLog('login_success',{requestId:res.locals.requestId,peer:peerId(req),actor:user.id});
    recordSecurityEvent('login_succeeded',actorRef(req,res),{id:user.id,name:user.username}); return result;
  }));
  app.post('/api/setup', (req,res,next) => { if (!auth(res).open) { next(failure(409,'El control de acceso ya está activado. Inicia sesión con tu cuenta.')); return; } if (!allowSetup) { next(failure(403,'Configura la cuenta inicial desde la consola del servidor.')); return; } if (loginLimit(peerId(req),res) && globalLoginLimit('global',res)) next(); }, asyncRoute(async (req,res) => startSession(req,res,await createFirstAdmin(req.body)),201,true));
  // Authentication and CSRF apply to all account, commercial and fiscal mutations.
  app.use('/api', (req,res,next) => {
    if (!auth(res).open && !auth(res).user) { next(failure(401,'Inicia sesión para acceder a tu espacio de trabajo.')); return; }
    res.locals.authenticated = !auth(res).open;
    if (!auth(res).open && isWrite(req) && (!req.get('X-CSRF-Token') || !timingSafeEqual(digest(req.get('X-CSRF-Token') || ''),digest(csrf(req))))) {
      securityLog('csrf_rejected',{requestId:res.locals.requestId,peer:peerId(req)}); next(failure(403,'Token de seguridad ausente o caducado. Recarga la sesión.')); return;
    }
    next();
  });
  app.post('/api/logout', (req,res) => { const user=auth(res).user; deleteSession(token(req)); res.setHeader('Clear-Site-Data','"cache", "storage"'); const {maxAge:_age,...clearing}=cookieOptions(req);res.clearCookie(name(req),clearing); if(user)recordSecurityEvent('logout',actorRef(req,res),{id:user.id,name:user.username}); securityLog('logout',{requestId:res.locals.requestId,peer:peerId(req)});res.json({ok:true}); });
  app.put('/api/me/password',asyncRoute(async(req,res)=>{ const current=auth(res); if(!current.user)throw failure(400,'Activa el control de acceso para gestionar contraseñas.'); const user=await changeOwnPassword(current.user.id,req.body,current.tokenHash,actorRef(req,res));res.locals.auth={...current,user};return sessionInfo(req,res);},200,true));
  app.use('/api', (_req,res,next)=>{ if(auth(res).user?.mustChangePassword){next(failure(403,'Debes cambiar tu contraseña temporal antes de continuar.','PASSWORD_CHANGE_REQUIRED'));return;}next(); });
  app.use('/api',(req,res,next)=>{const actor=actorRef(req,res);actorStore.run({id:actor.id,name:actor.name},next);});
  app.get('/api/users',requirePermission('users.manage'),(_req,res)=>res.json(listUsers()));
  app.post('/api/users',requirePermission('users.manage'),asyncRoute((req,res)=>createUser(req.body,actorRef(req,res)),201,true));
  app.put('/api/users/:id',requirePermission('users.manage'),asyncRoute((req,res)=>updateUser(req.params.id,req.body,actorRef(req,res)),200,true));
  app.delete('/api/users/:id/sessions',requirePermission('users.manage'),(req,res,next)=>{try{const revoked=revokeUserSessions(req.params.id,actorRef(req,res));if(req.params.id===auth(res).user?.id){const{maxAge:_age,...clearing}=cookieOptions(req);res.clearCookie(name(req),clearing);}res.json({ok:true,revoked});publishChange('users');}catch(error){next(error);}});
  app.get('/api/security-events',requirePermission('users.manage'),(req,res)=>res.json(listSecurityEvents(Number(req.query.limit)||100)));
  return { check, get enabled() { return hasUsers(); }, get credentialKind() { return hasUsers() ? 'personal-accounts' : 'demo'; }, sessionCount: () => Number((listUsers()).reduce((n,user)=>n+user.activeSessions,0)) };
}
