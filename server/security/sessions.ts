import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { RuntimeConfig } from '../config';
import { getWorkspaceInfo } from '../db';
import { loadCredential } from './password';
import { createLimiter, isWrite } from './http';
import { peerId, securityLog } from './log';
const digest = (value: string) => createHash('sha256').update(value).digest();
type Session = { expires: number; lastUsed: number; csrf: string };
export function installSessions(app: Express, config: RuntimeConfig, explicitPassword?: string) {
  const credential = loadCredential(config, explicitPassword), sessions = new Map<string, Session>();
  const loginLimit = createLimiter(10, 15 * 60_000), globalLoginLimit = createLimiter(60, 60_000, 1); let activeKdf = 0;
  const name = (req: Request) => req.secure ? '__Host-nexo_session' : 'nexo_session';
  const key = (req: Request) => digest(req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(name(req) + '='))?.slice(name(req).length + 1) || '').toString('hex');
  const find = (req: Request) => { const token = key(req), session = sessions.get(token), now = Date.now(); if (!session || session.expires <= now || session.lastUsed + 30 * 60_000 <= now) { sessions.delete(token); return null; } return session; };
  const check = (req: Request, touch = true) => { if (!credential.enabled) return true; const session = find(req); if (session && touch) session.lastUsed = Date.now(); return !!session; };
  const cookieOptions = (req: Request) => ({ httpOnly: true, sameSite: 'strict' as const, secure: req.secure, maxAge: 8 * 60 * 60_000, path: '/' });
  app.get('/api/session', (req, res) => { const session = find(req); res.json({ protected: credential.enabled, authenticated: check(req), csrfToken: session?.csrf || '', ...getWorkspaceInfo() }); });
  app.post('/api/login', async (req, res, next) => {
    if (!credential.enabled) { res.json({ ok: true }); return; }
    if (!loginLimit(peerId(req), res) || !globalLoginLimit('global', res)) return;
    if (activeKdf >= 2) { res.setHeader('Retry-After', '2'); res.status(429).json({ error: 'Acceso ocupado. Reintenta en unos segundos.' }); return; }
    const value = req.body?.password;
    if (typeof value !== 'string' || !value || value.length > 1024) { res.status(401).json({ error: 'La contraseña no es correcta.' }); return; }
    activeKdf++;
    try {
      if (!await credential.verify(value)) { securityLog('login_failed', { requestId: res.locals.requestId, peer: peerId(req) }); res.status(401).json({ error: 'La contraseña no es correcta.' }); return; }
      for (const [id, session] of sessions) if (session.expires <= Date.now() || session.lastUsed + 30 * 60_000 <= Date.now()) sessions.delete(id);
      if (sessions.size >= 256) { res.status(503).json({ error: 'Límite de sesiones alcanzado. Cierra una sesión o espera su caducidad.' }); return; }
      sessions.delete(key(req)); const token = randomBytes(32).toString('base64url');
      const session = { expires: Date.now() + 8 * 60 * 60_000, lastUsed: Date.now(), csrf: randomBytes(32).toString('base64url') }; sessions.set(digest(token).toString('hex'), session);
      res.cookie(name(req), token, cookieOptions(req)); securityLog('login_success', { requestId: res.locals.requestId, peer: peerId(req), actor: 'workspace-admin' }); res.json({ ok: true, csrfToken: session.csrf });
    } catch (error) { next(error); } finally { activeKdf--; }
  });
  const guard = (req: Request, res: Response, next: () => void) => {
    if (!check(req)) { res.status(401).json({ error: 'Inicia sesión para acceder a tu espacio de trabajo.' }); return; }
    res.locals.authenticated = credential.enabled;
    if (credential.enabled && isWrite(req)) {
      const csrf = req.get('X-CSRF-Token') || '';
      if (!csrf || !timingSafeEqual(digest(csrf), digest(find(req)?.csrf || ''))) { securityLog('csrf_rejected', { requestId: res.locals.requestId, peer: peerId(req) }); res.status(403).json({ error: 'Token de seguridad ausente o caducado. Recarga la sesión.' }); return; }
    }
    next();
  };
  app.post('/api/logout', guard, (req, res) => { sessions.delete(key(req)); res.setHeader('Clear-Site-Data', '"cache", "storage"'); const { maxAge: _age, ...clearing } = cookieOptions(req); res.clearCookie(name(req), clearing); securityLog('logout', { requestId: res.locals.requestId, peer: peerId(req) }); res.json({ ok: true }); });
  app.use('/api', guard);
  return { check, enabled: credential.enabled, credentialKind: credential.kind, sessionCount: () => sessions.size };
}
