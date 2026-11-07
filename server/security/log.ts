import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
const pseudonymKey = randomBytes(32);
export function peerId(req: Request) { return createHmac('sha256', pseudonymKey).update(req.ip || req.socket.remoteAddress || 'unknown').digest('hex').slice(0, 20); }
export function requestId() { return randomUUID(); }
export function securityLog(event: string, details: { requestId?: string; peer?: string; status?: number; route?: string; method?: string; reason?: string; actor?: string } = {}) {
  const record = { at: new Date().toISOString(), event, ...details };
  const directory = path.resolve(process.env.SECURITY_LOG_DIR || path.join(process.env.DATA_DIR || 'data', 'logs'));
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); const file = path.join(directory, 'security.ndjson');
    if (fs.existsSync(file) && fs.statSync(file).size > 10 * 1024 * 1024) { for (let i = 4; i > 0; i--) if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`); fs.renameSync(file, `${file}.1`); }
    fs.appendFileSync(file, JSON.stringify(record) + '\n', { mode: 0o600 });
  } catch { console.error('[security] No se pudo escribir el registro; revisa el almacenamiento.'); }
}
