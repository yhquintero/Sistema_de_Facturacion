import path from 'node:path';

/** Rutas de datos compartidas por el servidor y los scripts de consola (sin abrir la base). */
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const DB_PATH = path.join(DATA_DIR, 'facturacion.sqlite');
export const backupDirectory = () => path.resolve(process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups'));
