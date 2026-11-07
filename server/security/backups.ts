import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
const MAGIC = Buffer.from('NXBK0001'); const HEADER_BYTES = 36;
function readKey(file: string) { const key = fs.readFileSync(file); if (key.length !== 32) throw new Error('BACKUP_KEY_FILE debe contener exactamente 32 bytes aleatorios.'); return key; }
export function generateBackupKey(file: string) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.writeFileSync(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
export async function createEncryptedBackup(source: string, directory: string, keyFile: string) {
  const key = readKey(keyFile); const relative = path.relative(path.resolve(directory), path.resolve(keyFile));
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('La clave de respaldo no puede guardarse dentro del directorio de copias.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(directory, 0o700);
  if (!fs.statSync(source).isFile()) throw new Error('El origen de respaldo debe ser un archivo SQLite existente.');
  const scratch = fs.mkdtempSync(path.join(directory, '.private-snapshot-')); fs.chmodSync(scratch, 0o700);
  const id = `${new Date().toISOString().replaceAll(':','-').replaceAll('.','-')}-${randomUUID().slice(0,8)}`;
  const snapshot = path.join(scratch, 'snapshot.sqlite'), file = path.join(directory, `facturacion-${id}.nxb`);
  try {
    const db = new DatabaseSync(source, { readOnly: true }); try { db.prepare('VACUUM INTO ?').run(snapshot); } finally { db.close(); }
    fs.chmodSync(snapshot, 0o600);
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(MAGIC);
    fs.writeFileSync(file, Buffer.concat([MAGIC, iv, Buffer.alloc(16)]), { flag: 'wx', mode: 0o600 });
    await pipeline(fs.createReadStream(snapshot), cipher, fs.createWriteStream(file, { flags: 'r+', start: HEADER_BYTES }));
    const fd = fs.openSync(file, 'r+'); try { fs.writeSync(fd, cipher.getAuthTag(), 0, 16, 20); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const checksum = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) checksum.update(chunk);
    fs.writeFileSync(file + '.json', JSON.stringify({ format: 'NXBK0001', cipher: 'AES-256-GCM', createdAt: new Date().toISOString(), sha256: checksum.digest('hex'), bytes: fs.statSync(file).size }, null, 2), { flag: 'wx', mode: 0o600 });
    return file;
  } catch (error) { fs.rmSync(file, { force: true }); throw error; } finally { key.fill(0); fs.rmSync(scratch, { recursive: true, force: true }); }
}
export async function decryptBackupToNewFile(file: string, output: string, keyFile: string) {
  if (fs.existsSync(output)) throw new Error('La restauración solo admite un archivo de destino NUEVO. Nunca sobrescribe la base activa.');
  const key = readKey(keyFile); fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(output), `.restore-${randomUUID()}.sqlite`);
  try {
    const header = Buffer.alloc(HEADER_BYTES), fd = fs.openSync(file, 'r'); let bytes: number; try { bytes = fs.readSync(fd, header, 0, HEADER_BYTES, 0); } finally { fs.closeSync(fd); }
    if (bytes !== HEADER_BYTES || !header.subarray(0,8).equals(MAGIC)) throw new Error('Formato de respaldo no reconocido.');
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8,20)); decipher.setAAD(MAGIC); decipher.setAuthTag(header.subarray(20,36));
    await pipeline(fs.createReadStream(file, { start: HEADER_BYTES }), decipher, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    const db = new DatabaseSync(temporary, { readOnly: true }); try { const result = db.prepare('PRAGMA quick_check').get(); if (!result || Object.values(result)[0] !== 'ok') throw new Error('La copia no supera la comprobación de SQLite.'); } finally { db.close(); }
    fs.copyFileSync(temporary, output, fs.constants.COPYFILE_EXCL); fs.chmodSync(output, 0o600); return output;
  } finally { key.fill(0); fs.rmSync(temporary, { force: true }); }
}
