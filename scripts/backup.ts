import fs from 'node:fs';
import path from 'node:path';
import { createBackup, listBackups, restoreBackup, verifyBackup } from '../server/backups';
import { backupDirectory, DB_PATH } from '../server/paths';

/**
 * Copias de seguridad desde la consola del servidor.
 *   npm run backup                          Crea una copia (cifrada si existe BACKUP_KEY) y aplica la rotación.
 *   npm run backup:verify [-- <archivo>]    Comprueba la copia indicada o la más reciente.
 *   npm run backup:verify -- --all          Comprueba todas las copias.
 *   npm run backup:restore -- <archivo> --yes
 *                                          Restaura la copia (detén antes el servidor). La base actual
 *                                          se guarda como facturacion.sqlite.antes-de-restaurar-<fecha>.
 * Este script no abre la base del servidor salvo para leerla: no requiere que esté detenido para copiar.
 */
const [command = 'create', ...rest] = process.argv.slice(2);
const target = rest.find(arg => !arg.startsWith('--'));
const resolveFile = (name?: string) => {
  if (!name) { const latest = listBackups()[0]; if (!latest) throw new Error(`No hay copias en ${backupDirectory()}.`); return path.join(backupDirectory(), latest.name); }
  const direct = path.resolve(name); if (fs.existsSync(direct)) return direct;
  const inDirectory = path.join(backupDirectory(), path.basename(name)); if (fs.existsSync(inDirectory)) return inDirectory;
  throw new Error(`No se encontró la copia «${name}».`);
};
const describe = (check: { name: string; encrypted: boolean; integrity: string; tables: Record<string, number> }) =>
  `${check.integrity === 'ok' ? '✓' : '✗'} ${check.name} · ${check.encrypted ? 'cifrada' : 'sin cifrar'} · integridad: ${check.integrity} · ${Object.entries(check.tables).map(([t, n]) => `${t}: ${n}`).join(', ')}`;

try {
  if (command === 'create') {
    if (!process.env.BACKUP_KEY) console.warn('Aviso: BACKUP_KEY no está configurada; la copia se guardará comprimida pero SIN cifrar.');
    const info = createBackup(DB_PATH);
    console.log(`Copia creada: ${path.join(backupDirectory(), info.name)} (${(info.size / 1024).toFixed(1)} KB${info.encrypted ? ', AES-256-GCM' : ''}).`);
    if (info.removed.length) console.log(`Rotación: se eliminaron ${info.removed.length} copias antiguas.`);
  } else if (command === 'verify') {
    const files = rest.includes('--all') ? listBackups().map(b => path.join(backupDirectory(), b.name)) : [resolveFile(target)];
    let failed = 0;
    for (const file of files) {
      try { const { database: _database, ...check } = verifyBackup(file); console.log(describe(check)); if (check.integrity !== 'ok') failed++; }
      catch (error) { failed++; console.log(`✗ ${path.basename(file)} · ${(error as Error).message}`); }
    }
    if (failed) process.exitCode = 1;
  } else if (command === 'restore') {
    if (!target) throw new Error('Indica la copia que quieres restaurar: npm run backup:restore -- <archivo> --yes');
    if (!rest.includes('--yes')) throw new Error('La restauración sustituye la base actual. Detén el servidor y repite el comando con --yes para confirmar.');
    const { safetyCopy, check } = restoreBackup(resolveFile(target));
    console.log(describe(check));
    console.log(`Base restaurada en ${DB_PATH}.${safetyCopy ? ` La base anterior quedó en ${safetyCopy}.` : ''}`);
    console.log('Las sesiones no se restauran: cada persona deberá iniciar sesión de nuevo.');
  } else {
    throw new Error(`Comando desconocido «${command}». Usa create, verify o restore.`);
  }
} catch (error) {
  console.error((error as Error).message); process.exitCode = 1;
}
