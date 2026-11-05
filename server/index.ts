import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createApp } from './app';
import { db } from './db';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
  if (isProd) process.env.NODE_ENV = 'production';
  if (isProd && !process.env.APP_PASSWORD && process.env.ALLOW_PUBLIC_DEMO !== 'true') throw new Error('Configura APP_PASSWORD (mínimo 12 caracteres) antes de iniciar producción. Usa ALLOW_PUBLIC_DEMO=true únicamente para una demostración pública sin datos reales.');
  const app = createApp(); const httpServer = http.createServer(app);
  let closeVite: (() => Promise<void>) | undefined;
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, allowedHosts: true, hmr: { server: httpServer } }, appType: 'spa' });
    app.use(vite.middlewares); closeVite = () => vite.close();
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) throw new Error('No existe el frontend compilado. Ejecuta npm run build.');
    app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(distPath, { maxAge: 0 }));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, '0.0.0.0', () => console.log(`[Nexo Facturación] Web + API + Móvil disponibles en http://0.0.0.0:${port}${process.env.APP_PASSWORD ? ' · Acceso protegido' : ' · Demostración sin autenticación'}`));
  const shutdown = () => { httpServer.close(() => { db.close(); process.exit(0); }); void closeVite?.(); httpServer.closeIdleConnections(); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
bootstrap().catch(error => { console.error('No se pudo iniciar el servidor:', (error as Error).message); process.exit(1); });
