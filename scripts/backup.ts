import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve(process.env.DATA_DIR || 'data');
const source = path.join(directory, 'facturacion.sqlite');
if (!fs.existsSync(source)) throw new Error('No existe la base de datos que se desea respaldar.');
const backupDirectory = path.join(directory, 'backups'); fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
const filename = path.join(backupDirectory, `facturacion-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.sqlite`);
const db = new DatabaseSync(source);
try { db.prepare('VACUUM INTO ?').run(filename); fs.chmodSync(filename, 0o600); } finally { db.close(); }
// Las sesiones activas no se copian: restaurar una copia nunca reabre sesiones antiguas.
const copy = new DatabaseSync(filename);
try { if (copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_sessions'").get()) copy.exec('DELETE FROM user_sessions; VACUUM;'); } finally { copy.close(); }
console.log(`Copia consistente de SQLite creada: ${filename}`);
