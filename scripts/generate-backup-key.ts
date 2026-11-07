import path from 'node:path';
import { generateBackupKey } from '../server/security/backups';
if (!process.argv[2]) throw new Error('Indica un archivo nuevo fuera del directorio de copias.');
generateBackupKey(path.resolve(process.argv[2])); console.log('Clave generada con permisos privados. Almacena otra copia fuera del servidor; perderla impide recuperar los respaldos.');
