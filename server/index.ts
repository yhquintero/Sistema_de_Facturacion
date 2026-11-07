import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { readConfig, validateRuntime, loadTlsOptions } from './config';
import { loadCredential } from './security/password';
import { securityLog } from './security/log';

async function bootstrap() {
  const config = readConfig(); if (config.production) process.env.NODE_ENV = 'production';
  const credential = loadCredential(config);
  // TLS/privacy validation runs before any database is opened, including discovery.
  validateRuntime(config, true);
  let accountsExist = false;
  const existingPath = path.resolve(process.env.DATA_DIR || 'data', 'facturacion.sqlite');
  if (fs.existsSync(existingPath)) {
    const { DatabaseSync } = await import('node:sqlite');
    const existing = new DatabaseSync(existingPath, { readOnly: true });
    try { if (existing.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get()) accountsExist = !!existing.prepare('SELECT 1 FROM users LIMIT 1').get(); } finally { existing.close(); }
  }
  validateRuntime(config, credential.enabled || accountsExist);
  // Validate deployment before opening or initializing the database.
  const { createApp } = await import('./app'); const { db, getWorkspaceInfo } = await import('./db');
  const { closeRealtime } = await import('./realtime');
  if (config.allowPublicDemo && !getWorkspaceInfo().demo) throw new Error('ALLOW_PUBLIC_DEMO solo admite una base marcada como demostración; no habilita datos reales.');
  if (!credential.enabled && !accountsExist && !getWorkspaceInfo().demo) throw new Error('No se permite acceso sin autenticación a un espacio no demostrativo.');
  const { hasUsers } = await import('./users');
  // A server restart/recovery invalidates all saved sessions, as before hardening.
  db.prepare('DELETE FROM user_sessions').run();
  const app = createApp({ config });
  const server = config.tlsMode === 'direct' ? https.createServer(loadTlsOptions(config), app) : http.createServer(app);
  server.headersTimeout = 15_000; server.requestTimeout = 30_000; server.keepAliveTimeout = 5_000; server.maxConnections = 300;
  let closeVite: (() => Promise<void>) | undefined;
  if (!config.production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, allowedHosts: true, hmr: { server } }, appType: 'spa' });
    app.use(vite.middlewares); closeVite = () => vite.close();
  } else {
    const distPath = path.resolve('dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) throw new Error('No existe el frontend compilado. Ejecuta npm run build.');
    app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y', dotfiles: 'deny' }));
    app.use(express.static(distPath, { maxAge: 0, dotfiles: 'deny' }));
    app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(distPath, 'index.html')); });
  }
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); }); });
  console.log(`[Nexo] Web + API + tiempo real: ${config.publicOrigin || `http://${config.host}:${config.port}`} · ${hasUsers() ? 'Espacio protegido' : 'Solo demostración'} · TLS ${config.tlsMode}`);
  securityLog('server_started', { reason: `tls:${config.tlsMode};auth:${hasUsers() ? 'personal-accounts' : 'demo'}` });
  const redirectPort = config.redirectPort;
  let redirect: http.Server | undefined;
  if (redirectPort) {
    redirect = http.createServer((req, res) => { if (!['GET','HEAD'].includes(req.method || '')) { res.writeHead(426, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('Utiliza HTTPS; no se admiten credenciales por HTTP.'); return; } res.writeHead(308, { Location: config.publicOrigin + (req.url?.startsWith('/') ? req.url : '/'), 'Cache-Control': 'no-store' }); res.end(); });
    await new Promise<void>((resolve, reject) => { redirect!.once('error', reject); redirect!.listen(redirectPort, config.host, resolve); });
  }
  let closing = false;
  const shutdown = () => { if (closing) return; closing = true; if (config.shutdownFile) { fs.unwatchFile(config.shutdownFile); try { fs.rmSync(config.shutdownFile, { force: true }); } catch { /* shutdown must still complete */ } } closeRealtime(); redirect?.close(); void closeVite?.(); const watchdog = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10_000); watchdog.unref(); server.close(() => { clearTimeout(watchdog); db.close(); process.exit(0); }); server.closeIdleConnections(); };
  if (config.shutdownFile) fs.watchFile(config.shutdownFile, { interval: 500, persistent: false }, () => { try { const stat = fs.lstatSync(config.shutdownFile); if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 64 && fs.readFileSync(config.shutdownFile, 'utf8').trim() === 'shutdown') shutdown(); } catch { /* no signal or not readable */ } });
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
bootstrap().catch(error => { console.error('No se pudo iniciar el servidor:', (error as Error).message); process.exit(1); });
