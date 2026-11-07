import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { peerId } from './security/log';
type Stream = { res: Response; peer: string; allowed: () => boolean };
const streams = new Set<Stream>(); const epoch = randomUUID(); let sequence = 0;
const MAX_BUFFER = 64 * 1024;
function usable(stream: Stream) {
  if (stream.res.destroyed || stream.res.writableEnded || stream.res.writableLength > MAX_BUFFER) { stream.res.destroy(); streams.delete(stream); return false; }
  if (!stream.allowed()) { stream.res.write('event: session-expired\ndata: {}\n\n'); stream.res.end(); streams.delete(stream); return false; }
  return true;
}
export function publishChange(scope: string) {
  const payload = JSON.stringify({ scope, at: new Date().toISOString() }), id = `${epoch}:${++sequence}`;
  for (const stream of streams) if (usable(stream)) stream.res.write(`id: ${id}\nevent: changed\ndata: ${payload}\n\n`);
}
export function installRealtime(app: Express, authenticated: (req: Request, touch?: boolean) => boolean) {
  app.get('/api/events', (req, res) => {
    const peer = peerId(req);
    if (streams.size >= 100 || [...streams].filter(s => s.peer === peer).length >= 12) { res.status(429).json({ error: 'Demasiadas conexiones en tiempo real.' }); return; }
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-store, no-transform'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders();
    const stream = { res, peer, allowed: () => authenticated(req, false) }; streams.add(stream);
    // Reconnect always requires a fresh authorized snapshot; notifications contain no PII.
    res.write(`retry: 3000\nevent: connected\ndata: ${JSON.stringify({ at: new Date().toISOString(), resync: true })}\n\n`);
    const timer = setInterval(() => { if (usable(stream)) res.write(': heartbeat\n\n'); }, 15_000); timer.unref();
    res.on('close', () => { clearInterval(timer); streams.delete(stream); });
  });
}
export function realtimeConnectionCount() { return streams.size; }
export function closeRealtime() { for (const { res } of streams) res.end(); streams.clear(); }
