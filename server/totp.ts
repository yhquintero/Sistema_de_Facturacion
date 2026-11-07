import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/* ============================================================================
 * VERIFICACIÓN EN DOS PASOS (TOTP, RFC 6238)
 * Compatible con Google Authenticator, Microsoft Authenticator, 1Password, Aegis…
 * - Secreto aleatorio de 160 bits en base32. Códigos de 6 dígitos cada 30 s (HMAC-SHA1).
 * - Se acepta ±1 periodo para tolerar relojes algo desfasados.
 * - Un código ya usado no vale otra vez (protección contra reutilización).
 * ============================================================================ */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buffer) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0; const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char); if (index === -1) throw new Error('Secreto base32 no válido.');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string { return base32Encode(randomBytes(20)); }
export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD);

/** Código de 6 dígitos para un periodo concreto (RFC 4226 §5.3). */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * Comprueba un código. Devuelve el periodo aceptado (para guardarlo y evitar que se reutilice)
 * o 0 si no es válido. Solo acepta periodos posteriores a `lastStep`.
 */
export function verifyTotp(secret: string, code: unknown, lastStep = 0, now = Date.now(), window = 1): number {
  const digits = String(code ?? '').replace(/\s/g, '');
  if (!secret || !/^\d{6}$/.test(digits)) return 0;
  const step = currentStep(now);
  for (let s = step - window; s <= step + window; s++) {
    if (s <= lastStep) continue;
    const expected = Buffer.from(totpCode(secret, s)); const given = Buffer.from(digits);
    if (timingSafeEqual(expected, given)) return s;
  }
  return 0;
}

export function otpauthUri(secret: string, account: string, issuer = 'Nexo Facturación'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/* ---------------------------------------------------------------- códigos de recuperación */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
export const normalizeRecoveryCode = (code: unknown) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashRecoveryCode = (code: string) => createHash('sha256').update(`nexo-recovery:${normalizeRecoveryCode(code)}`).digest('hex');
/** Diez códigos de un solo uso con formato XXXXX-XXXXX. Solo se guardan sus huellas SHA-256. */
export function generateRecoveryCodes(count = 10): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => { let raw = ''; for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]; return `${raw.slice(0, 5)}-${raw.slice(5)}`; });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}
/** Si el código coincide con uno pendiente, devuelve la lista sin él; si no, `null`. */
export function consumeRecoveryCode(hashes: string[], code: unknown): string[] | null {
  const normalized = normalizeRecoveryCode(code); if (normalized.length !== 10) return null;
  const digest = hashRecoveryCode(normalized); const index = hashes.indexOf(digest);
  return index === -1 ? null : hashes.filter((_, i) => i !== index);
}
