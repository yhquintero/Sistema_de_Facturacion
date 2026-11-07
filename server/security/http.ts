import type { Express, Request, Response } from 'express';
import type { RuntimeConfig } from '../config';
import { peerId, requestId, securityLog } from './log';

export function installHttpSecurity(app: Express, config: RuntimeConfig) {
  app.disable('x-powered-by'); app.set('trust proxy', config.trustedProxies.length ? config.trustedProxies : false);
  app.use((req, res, next) => {
    const id = requestId(); res.locals.requestId = id; res.setHeader('X-Request-ID', id);
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('X-DNS-Prefetch-Control', 'off');
    const pdf = /^\/api\/invoices\/[^/]+\/export\/pdf/.test(req.path);
    const ancestors = pdf ? "'self'" : config.frameAncestors;
    if (ancestors === "'none'") res.setHeader('X-Frame-Options', 'DENY'); else if (ancestors === "'self'") res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const development = !config.production;
    const csp = `default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self'${development ? " 'unsafe-inline' 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'${development ? ' ws: wss:' : ''}; frame-src 'self' blob:; frame-ancestors ${ancestors}; form-action 'self'; worker-src 'self'; manifest-src 'self'`;
    res.setHeader('Content-Security-Policy', csp);
    if (config.production && req.secure) res.setHeader('Strict-Transport-Security', `max-age=${config.hstsSeconds}`);
    if (req.path.startsWith('/api/') || req.path === '/' || req.path.endsWith('.html') || req.path === '/sw.js') res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => { if (req.path.startsWith('/api/') && req.path !== '/api/health') securityLog('http', { requestId: id, peer: peerId(req), status: res.statusCode, method: req.method, route: String(req.route?.path || '/api/unmatched'), actor: res.locals.auth?.user?.id || (res.locals.auth?.open ? 'demo' : 'anonymous') }); });
    const publicRoute = ['/api/health', '/api/privacy'].includes(req.path);
    if (config.publicOrigin && !publicRoute) {
      const hosts = new Set([...config.allowedOrigins].map(v => new URL(v).host));
      if (!hosts.has(req.get('host') || '')) { res.status(421).json({ error: 'Host no autorizado.' }); return; }
    }
    if (config.tlsMode !== 'off' && !req.secure && !publicRoute) {
      if (['GET', 'HEAD'].includes(req.method) && !req.path.startsWith('/api/')) { res.redirect(308, config.publicOrigin + req.originalUrl); return; }
      res.status(426).json({ error: 'Esta operación exige HTTPS.' }); return;
    }
    if (req.path.startsWith('/api/') && !publicRoute) {
      if (req.get('Sec-Fetch-Site') === 'cross-site') { res.status(403).json({ error: 'Solicitud entre sitios no autorizada.' }); return; }
      const origin = req.get('origin');
      if (origin) {
        try {
          const parsed = new URL(origin);
          const allowed = config.allowedOrigins.size ? config.allowedOrigins.has(parsed.origin) : parsed.host === req.get('host') && ['http:', 'https:'].includes(parsed.protocol);
          if (!allowed || parsed.origin === 'null') { res.status(403).json({ error: 'Origen de solicitud no autorizado.' }); return; }
        } catch { res.status(403).json({ error: 'Origen no válido.' }); return; }
      }
    }
    next();
  });
}
export function createLimiter(limit: number, windowMs: number, maxKeys = 5000) {
  const windows = new Map<string, { count: number; expires: number }>();
  const allow = (key: string, res: Response) => {
    const now = Date.now(); for (const [id, state] of windows) if (state.expires <= now) windows.delete(id);
    if (!windows.has(key) && windows.size >= maxKeys) { res.setHeader('Retry-After', '60'); res.status(429).json({ error: 'Servicio ocupado. Inténtalo más tarde.' }); return false; }
    const state = windows.get(key) || { count: 0, expires: now + windowMs }; state.count++; windows.set(key, state);
    if (state.count > limit) { res.setHeader('Retry-After', String(Math.ceil((state.expires - now) / 1000))); res.status(429).json({ error: 'Demasiadas solicitudes. Respeta el tiempo de reintento.' }); return false; }
    return true;
  };
  return Object.assign(allow, { reset: (key: string) => windows.delete(key) });
}
export const isWrite = (req: Request) => !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
