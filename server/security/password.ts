import fs from 'node:fs';
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RuntimeConfig } from '../config';
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, parameters, (error, key) => error ? reject(error) : resolve(key)));
export async function hashPassword(password: string) {
  if (password.trim().length < 14 || password.length > 1024) throw new Error('Usa una frase de acceso de 14 a 1024 caracteres.');
  const salt = randomBytes(16); const hash = await derive(password, salt);
  return `scrypt$32768$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
export function parsePasswordHash(value: string) {
  const parts = value.trim().split('$');
  if (parts.length !== 6 || parts.slice(0,4).join('$') !== 'scrypt$32768$8$1') throw new Error('Formato de APP_PASSWORD_HASH_FILE no admitido. Genera el hash con npm run password:hash.');
  const salt = Buffer.from(parts[4], 'base64url'), hash = Buffer.from(parts[5], 'base64url');
  if (salt.length !== 16 || hash.length !== 32 || !/^[A-Za-z0-9_-]+$/.test(parts[4] + parts[5])) throw new Error('Hash de acceso no válido.');
  return { salt, hash };
}
export async function verifyPassword(password: string, encoded: string) {
  const { salt, hash } = parsePasswordHash(encoded); return timingSafeEqual(await derive(password, salt), hash);
}
export function loadCredential(config: RuntimeConfig, explicitPassword?: string) {
  if (explicitPassword !== undefined) return credentialFromPlaintext(explicitPassword);
  if (config.passwordHashFile) { const encoded = fs.readFileSync(config.passwordHashFile, 'utf8').trim(); parsePasswordHash(encoded); return { enabled: true, kind: 'scrypt-file', bootstrapHash: () => encoded, verify: (value: string) => verifyPassword(value, encoded) }; }
  const plain = config.passwordFile ? fs.readFileSync(config.passwordFile, 'utf8').trimEnd() : process.env.APP_PASSWORD || '';
  return credentialFromPlaintext(plain);
}
function credentialFromPlaintext(plain: string) {
  if (plain && (plain.length < 12 || plain.length > 1024)) throw new Error('APP_PASSWORD debe tener entre 12 y 1024 caracteres. Se recomienda un hash y una frase de 14 o más.');
  const expected = createHash('sha256').update(plain).digest();
  return { enabled: !!plain, kind: plain ? 'legacy-password' : 'demo', bootstrapHash: () => { if (!plain) return ''; const salt = randomBytes(16); return `scrypt$32768$8$1$${salt.toString('base64url')}$${scryptSync(plain, salt, 32, parameters).toString('base64url')}`; }, verify: async (value: string) => timingSafeEqual(createHash('sha256').update(value).digest(), expected) };
}
