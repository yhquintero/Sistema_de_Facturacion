import fs from 'node:fs';
import path from 'node:path';
import { createEncryptedBackup } from './security/backups';
import { backupDirectory, DB_PATH } from './paths';
import type { BackupInfo, BackupStatus } from '../shared/permissions';

/* ============================================================================
 * COPIAS DE SEGURIDAD: ROTACIÓN, PROGRAMACIÓN Y PANEL
 * El formato y el cifrado son los de server/security/backups.ts (NXBK0001, AES-256-GCM con
 * BACKUP_KEY_FILE de 32 bytes, sin sesiones, con suma SHA-256 en el .json adjunto).
 * Aquí solo se añade: conservar las BACKUP_KEEP copias más recientes, una copia diaria a partir
 * de BACKUP_HOUR y el listado para el panel de administración. Nunca se crean copias sin cifrar.
 * ============================================================================ */

const NAME_PATTERN = /^facturacion-[0-9A-Za-z-]+\.nxb$/;
export const backupKeyFile = () => (process.env.BACKUP_KEY_FILE ? path.resolve(process.env.BACKUP_KEY_FILE) : '');
/** Copias locales que se conservan (30). BACKUP_KEEP=0 desactiva la rotación (retención gestionada por el operador). */
export const backupKeep = () => { const raw = process.env.BACKUP_KEEP; const n = Number(raw); return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 3650 ? n : 30; };
export const backupHour = () => { const n = Number(process.env.BACKUP_HOUR); return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 2; };
export const isBackupName = (name: string) => NAME_PATTERN.test(name) && path.basename(name) === name;

function createdAt(directory: string, name: string): string {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8')) as { createdAt?: unknown };
    if (typeof meta.createdAt === 'string' && !Number.isNaN(Date.parse(meta.createdAt))) return meta.createdAt;
  } catch { /* sin metadatos: se usa la fecha del archivo */ }
  return fs.statSync(path.join(directory, name)).mtime.toISOString();
}

export function listBackups(directory = backupDirectory()): BackupInfo[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(isBackupName).map(name => ({ name, size: fs.statSync(path.join(directory, name)).size, createdAt: createdAt(directory, name), encrypted: true }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
}

/** Borra las copias más antiguas (y sus .json) por encima de BACKUP_KEEP. */
export function rotateBackups(directory = backupDirectory(), keep = backupKeep()): string[] {
  if (keep <= 0) return [];
  const removed = listBackups(directory).slice(keep).map(b => b.name);
  for (const name of removed) { fs.rmSync(path.join(directory, name), { force: true }); fs.rmSync(path.join(directory, `${name}.json`), { force: true }); }
  return removed;
}

/** Copia cifrada consistente + rotación. Exige BACKUP_KEY_FILE: el servidor nunca deja copias legibles. */
export async function createBackup(options: { source?: string; directory?: string; keyFile?: string; keep?: number } = {}): Promise<BackupInfo & { removed: string[] }> {
  const keyFile = options.keyFile ?? backupKeyFile();
  if (!keyFile) throw Object.assign(new Error('Configura BACKUP_KEY_FILE (npm run backup:key -- <archivo>) para crear copias cifradas. La clave debe guardarse fuera del directorio de copias.'), { status: 409, code: 'BACKUP_KEY_MISSING' });
  const directory = options.directory ?? backupDirectory();
  const file = await createEncryptedBackup(options.source ?? DB_PATH, directory, keyFile);
  const removed = rotateBackups(directory, options.keep ?? backupKeep());
  const name = path.basename(file);
  return { name, size: fs.statSync(file).size, createdAt: createdAt(directory, name), encrypted: true, removed };
}

export function backupStatus(enabled: boolean): BackupStatus {
  const backups = listBackups();
  return { enabled, encrypted: !!backupKeyFile(), keep: backupKeep(), hour: backupHour(), directory: path.relative(process.cwd(), backupDirectory()) || '.', backups, lastBackupAt: backups[0]?.createdAt || '' };
}

/** Copia diaria a partir de BACKUP_HOUR (hora local del servidor). Devuelve la función para detenerla. */
export function scheduleDailyBackups(onCreated: (info: BackupInfo & { removed: string[] }) => void = () => {}): () => void {
  let running = false;
  const tick = () => {
    const now = new Date(); if (running || now.getHours() < backupHour()) return;
    const last = listBackups()[0]; if (last && new Date(last.createdAt).toDateString() === now.toDateString()) return;
    running = true;
    void createBackup().then(info => { onCreated(info); console.log(`[Nexo] Copia de seguridad automática cifrada: ${info.name}`); })
      .catch(error => console.error('[Nexo] Falló la copia de seguridad automática:', (error as Error).message))
      .finally(() => { running = false; });
  };
  const initial = setTimeout(tick, 30_000); const timer = setInterval(tick, 10 * 60_000);
  initial.unref(); timer.unref();
  return () => { clearTimeout(initial); clearInterval(timer); };
}
