import fs from 'node:fs';
import path from 'node:path';
import { createEncryptedBackup, createSessionlessSnapshot } from '../server/security/backups';
const directory = path.resolve(process.env.DATA_DIR || 'data'), source = path.join(directory, 'facturacion.sqlite');
if (!fs.existsSync(source)) throw new Error('No existe la base de datos que se desea respaldar.');
const destination = path.join(directory, 'backups');
if (process.env.BACKUP_KEY_FILE) console.log(`Copia consistente cifrada AES-256-GCM: ${await createEncryptedBackup(source, destination, path.resolve(process.env.BACKUP_KEY_FILE))}`);
else if (process.argv.includes('--allow-plaintext') && process.env.NODE_ENV !== 'production') {
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 }); const filename = path.join(destination, `INSEGURO-SOLO-LAB-${Date.now()}.sqlite`);
  createSessionlessSnapshot(source,filename); console.warn(`ADVERTENCIA: copia de laboratorio sin cifrar: ${filename}`);
} else throw new Error('Configura BACKUP_KEY_FILE (32 bytes, fuera de backups). El panel crea esta clave; conserva una copia separada y protegida.');
