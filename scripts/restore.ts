import path from 'node:path';
import { decryptBackupToNewFile } from '../server/security/backups';
const [source, output] = process.argv.slice(2);
if (!source || !output || !process.env.BACKUP_KEY_FILE) throw new Error('Uso: npm run backup:decrypt -- copia.nxb archivo-NUEVO.sqlite. Requiere BACKUP_KEY_FILE. No reemplaza la base activa.');
console.log(`Copia autenticada y SQLite comprobado: ${await decryptBackupToNewFile(path.resolve(source), path.resolve(output), path.resolve(process.env.BACKUP_KEY_FILE))}`);
