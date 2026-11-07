import fs from 'node:fs';
import path from 'node:path';
import { createSessionlessSnapshot } from '../server/security/backups';
import { createBackup, backupKeep } from '../server/backups';
import { backupDirectory, DB_PATH } from '../server/paths';
if (!fs.existsSync(DB_PATH)) throw new Error('No existe la base de datos que se desea respaldar.');
const destination = backupDirectory();
if (process.env.BACKUP_KEY_FILE) {
  const info = await createBackup({ source: DB_PATH, directory: destination });
  console.log(`Copia consistente cifrada AES-256-GCM: ${path.join(destination, info.name)}`);
  if (info.removed.length) console.log(`Rotación: se conservan las ${backupKeep()} más recientes; eliminadas ${info.removed.length}.`);
} else if (process.argv.includes('--allow-plaintext') && process.env.NODE_ENV !== 'production') {
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 }); const filename = path.join(destination, `INSEGURO-SOLO-LAB-${Date.now()}.sqlite`);
  createSessionlessSnapshot(DB_PATH, filename); console.warn(`ADVERTENCIA: copia de laboratorio sin cifrar: ${filename}`);
} else throw new Error('Configura BACKUP_KEY_FILE (32 bytes, fuera de backups). El panel crea esta clave; conserva una copia separada y protegida.');
