import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { backupDirectory, DB_PATH } from './paths';
import type { BackupInfo, BackupStatus } from '../shared/permissions';

/* ============================================================================
 * COPIAS DE SEGURIDAD CIFRADAS
 * - Copia consistente de SQLite (VACUUM INTO) sin sesiones abiertas ni bloqueos de acceso.
 * - Comprimida con gzip y, si existe BACKUP_KEY, cifrada con AES-256-GCM: el contenido no se
 *   puede leer ni alterar sin la clave (la etiqueta GCM detecta cualquier modificación).
 * - Formato: "NEXOENC1" | sal (16) | IV (12) | etiqueta (16) | datos. Clave = scrypt(BACKUP_KEY, sal).
 * - Rotación: se conservan las BACKUP_KEEP copias más recientes (30 por defecto).
 * ============================================================================ */

const MAGIC = Buffer.from('NEXOENC1');
const HEADER_LENGTH = MAGIC.length + 16 + 12 + 16;
const NAME_PATTERN = /^(nexo|facturacion)-[0-9TZ-]+\.sqlite(\.gz)?(\.enc)?$/;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const backupKey = () => process.env.BACKUP_KEY || '';
export const backupKeep = () => { const n = Number(process.env.BACKUP_KEEP); return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : 30; };
export const backupHour = () => { const n = Number(process.env.BACKUP_HOUR); return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 2; };
export const isBackupName = (name: string) => NAME_PATTERN.test(name) && path.basename(name) === name;

export function encryptBackup(plain: Buffer, key: string): Buffer {
  if (key.length < 16) throw new Error('BACKUP_KEY debe tener al menos 16 caracteres.');
  const salt = randomBytes(16); const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(key, salt, 32, SCRYPT_OPTIONS), iv);
  cipher.setAAD(MAGIC);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}
export const isEncrypted = (buffer: Buffer) => buffer.length >= HEADER_LENGTH && buffer.subarray(0, MAGIC.length).equals(MAGIC);
export function decryptBackup(buffer: Buffer, key: string): Buffer {
  if (!isEncrypted(buffer)) throw new Error('El archivo no es una copia cifrada de Nexo.');
  if (!key) throw new Error('Esta copia está cifrada: configura BACKUP_KEY con la clave usada al crearla.');
  let offset = MAGIC.length;
  const salt = buffer.subarray(offset, offset += 16); const iv = buffer.subarray(offset, offset += 12); const tag = buffer.subarray(offset, offset += 16);
  const decipher = createDecipheriv('aes-256-gcm', scryptSync(key, salt, 32, SCRYPT_OPTIONS), iv);
  decipher.setAAD(MAGIC); decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(buffer.subarray(offset)), decipher.final()]); }
  catch { throw new Error('No se pudo descifrar la copia: la clave no es correcta o el archivo está dañado.'); }
}
/** Devuelve los bytes SQLite de una copia (cifrada, comprimida o plana). */
export function readBackupDatabase(buffer: Buffer, key = backupKey()): Buffer {
  const unwrapped = isEncrypted(buffer) ? decryptBackup(buffer, key) : buffer;
  const plain = unwrapped[0] === 0x1f && unwrapped[1] === 0x8b ? gunzipSync(unwrapped) : unwrapped;
  if (plain.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000') throw new Error('El contenido no es una base de datos SQLite.');
  return plain;
}

const stamp = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z').replaceAll(':', '-');
function stripVolatile(file: string) {
  const copy = new DatabaseSync(file);
  try {
    // Restaurar una copia nunca debe reabrir sesiones antiguas ni arrastrar bloqueos de acceso.
    for (const table of ['user_sessions', 'login_failures']) if (copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) copy.exec(`DELETE FROM ${table}`);
    copy.exec('VACUUM');
  } finally { copy.close(); }
}

export function listBackups(directory = backupDirectory()): BackupInfo[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(isBackupName).map(name => {
    const stat = fs.statSync(path.join(directory, name));
    return { name, size: stat.size, createdAt: stat.mtime.toISOString(), encrypted: name.endsWith('.enc') };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
}

/** Crea una copia desde una conexión abierta (servidor) o desde la ruta de la base (consola). */
export function createBackup(source: DatabaseSync | string = DB_PATH, options: { directory?: string; key?: string; keep?: number; now?: Date } = {}): BackupInfo & { removed: string[] } {
  const directory = options.directory ?? backupDirectory(); const key = options.key ?? backupKey();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.tmp-${randomUUID()}.sqlite`);
  const connection = typeof source === 'string' ? (() => { if (!fs.existsSync(source)) throw new Error('No existe la base de datos que se desea respaldar.'); return new DatabaseSync(source); })() : source;
  try {
    connection.prepare('VACUUM INTO ?').run(temporary);
    if (typeof source === 'string') connection.close();
    stripVolatile(temporary);
    const compressed = gzipSync(fs.readFileSync(temporary), { level: 9 });
    let base = `nexo-${stamp(options.now ?? new Date())}`;
    while (fs.existsSync(path.join(directory, `${base}.sqlite.gz${key ? '.enc' : ''}`))) base += '-1';
    const name = `${base}.sqlite.gz${key ? '.enc' : ''}`;
    const file = path.join(directory, name);
    fs.writeFileSync(file, key ? encryptBackup(compressed, key) : compressed, { mode: 0o600 });
    const removed = rotateBackups(directory, options.keep ?? backupKeep());
    const stat = fs.statSync(file);
    return { name, size: stat.size, createdAt: stat.mtime.toISOString(), encrypted: !!key, removed };
  } finally {
    fs.rmSync(temporary, { force: true });
    if (typeof source === 'string') { try { connection.close(); } catch { /* ya cerrada */ } }
  }
}
export function rotateBackups(directory = backupDirectory(), keep = backupKeep()): string[] {
  const removed = listBackups(directory).slice(keep).map(b => b.name);
  for (const name of removed) fs.rmSync(path.join(directory, name), { force: true });
  return removed;
}

export type BackupCheck = { name: string; encrypted: boolean; integrity: string; tables: Record<string, number> };
/** Descifra, descomprime y abre la copia en un archivo temporal para comprobar su integridad. */
export function verifyBackup(file: string, key = backupKey()): BackupCheck & { database: Buffer } {
  const buffer = fs.readFileSync(file); const database = readBackupDatabase(buffer, key);
  const temporary = path.join(path.dirname(file), `.verify-${randomUUID()}.sqlite`);
  fs.writeFileSync(temporary, database, { mode: 0o600 });
  try {
    const copy = new DatabaseSync(temporary, { readOnly: true });
    try {
      const integrity = String((copy.prepare('PRAGMA integrity_check').get() as Record<string, unknown>).integrity_check);
      const tables: Record<string, number> = {};
      for (const table of ['users', 'clients', 'contracts', 'invoices', 'service_catalog']) {
        if (copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) tables[table] = Number((copy.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
      }
      return { name: path.basename(file), encrypted: isEncrypted(buffer), integrity, tables, database };
    } finally { copy.close(); }
  } finally { fs.rmSync(temporary, { force: true }); }
}

/**
 * Restaura una copia sobre la base (solo desde consola y con el servidor detenido).
 * Antes guarda la base actual como facturacion.sqlite.antes-de-restaurar-<fecha>.
 */
export function restoreBackup(file: string, options: { target?: string; key?: string } = {}): { safetyCopy: string; check: BackupCheck } {
  const target = options.target ?? DB_PATH;
  const { database, ...check } = verifyBackup(file, options.key);
  if (check.integrity !== 'ok') throw new Error(`La copia no supera la comprobación de integridad: ${check.integrity}`);
  let safetyCopy = '';
  if (fs.existsSync(target)) {
    safetyCopy = `${target}.antes-de-restaurar-${stamp(new Date())}`;
    const current = new DatabaseSync(target);
    try { current.prepare('VACUUM INTO ?').run(safetyCopy); } finally { current.close(); }
    fs.chmodSync(safetyCopy, 0o600);
  }
  for (const suffix of ['-wal', '-shm']) fs.rmSync(`${target}${suffix}`, { force: true });
  fs.writeFileSync(target, database, { mode: 0o600 });
  return { safetyCopy, check };
}

export function backupStatus(enabled: boolean): BackupStatus {
  const backups = listBackups();
  return { enabled, encrypted: !!backupKey(), keep: backupKeep(), hour: backupHour(), directory: path.relative(process.cwd(), backupDirectory()) || '.', backups, lastBackupAt: backups[0]?.createdAt || '' };
}

/** Programa una copia diaria a partir de BACKUP_HOUR (hora local del servidor). */
export function scheduleDailyBackups(db: DatabaseSync, onCreated: (info: BackupInfo & { removed: string[] }) => void = () => {}): () => void {
  const tick = () => {
    try {
      const now = new Date(); if (now.getHours() < backupHour()) return;
      const last = listBackups()[0]; const today = now.toDateString();
      if (last && new Date(last.createdAt).toDateString() === today) return;
      const info = createBackup(db); onCreated(info);
      console.log(`[Nexo] Copia de seguridad automática: ${info.name}${info.encrypted ? ' (cifrada)' : ' (SIN cifrar: configura BACKUP_KEY)'}`);
    } catch (error) { console.error('[Nexo] Falló la copia de seguridad automática:', (error as Error).message); }
  };
  const initial = setTimeout(tick, 30_000); const timer = setInterval(tick, 10 * 60_000);
  initial.unref(); timer.unref();
  return () => { clearTimeout(initial); clearInterval(timer); };
}
