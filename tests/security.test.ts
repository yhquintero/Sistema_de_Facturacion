import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-security-'));
process.env.DATA_DIR = directory; process.env.SEED_DEMO = 'true'; delete process.env.BACKUP_KEY;
const { base32Decode, base32Encode, consumeRecoveryCode, currentStep, generateRecoveryCodes, otpauthUri, totpCode, verifyTotp } = await import('../server/totp');
const { createBackup, decryptBackup, encryptBackup, listBackups, readBackupDatabase, restoreBackup, verifyBackup } = await import('../server/backups');
const { createApp } = await import('../server/app');
const { db } = await import('../server/db');
const { registerLoginFailure, loginLockRemainingMs, clearLoginFailures } = await import('../server/users');

const ADMIN_PASSWORD = 'contraseña-del-admin-2026';
let server: http.Server, strictServer: http.Server, origin: string, strictOrigin: string;
const listen = async (app: http.RequestListener) => { const s = http.createServer(app); await new Promise<void>(resolve => s.listen(0, '127.0.0.1', resolve)); return { s, url: `http://127.0.0.1:${(s.address() as { port: number }).port}` }; };
before(async () => {
  ({ s: server, url: origin } = await listen(createApp({ password: ADMIN_PASSWORD, allowSetup: false, securityHeaders: false, requireAdminTwoFactor: false })));
  ({ s: strictServer, url: strictOrigin } = await listen(createApp({ password: '', allowSetup: false, securityHeaders: true, requireAdminTwoFactor: true })));
});
after(async () => {
  await Promise.all([server, strictServer].map(s => new Promise<void>(resolve => s.close(() => resolve()))));
  db.close(); fs.rmSync(directory, { recursive: true, force: true });
});

type Call = { status: number; body: any; cookie: string; headers: Headers };
async function call(url: string, method = 'GET', body?: unknown, cookie = '', base = origin, extra: Record<string, string> = { 'X-Nexo-Request': '1' }): Promise<Call> {
  const response = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json', ...extra, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let parsed: any = text; try { parsed = JSON.parse(text); } catch { /* binario */ }
  return { status: response.status, body: parsed, cookie: response.headers.get('set-cookie')?.split(';')[0] || '', headers: response.headers };
}
const login = async (username: string, password: string, base = origin) => { const r = await call('/api/login', 'POST', { username, password }, '', base); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.cookie, 'debe abrir sesión'); return r.cookie; };
const resetReplay = (username: string) => db.prepare('UPDATE users SET totp_last_step=0 WHERE username=?').run(username);
const nextCode = (secret: string) => totpCode(secret, currentStep());

/* ------------------------------------------------------------------------- TOTP */
test('TOTP matches the RFC 6238 SHA-1 test vectors and base32 round-trips', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
  // Vectores del RFC (8 dígitos) reducidos a los 6 últimos.
  for (const [seconds, expected] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']] as const) assert.equal(totpCode(secret, Math.floor(seconds / 30)), expected, `T=${seconds}`);
  assert.match(otpauthUri(secret, 'ana.perez'), /^otpauth:\/\/totp\/Nexo%20Facturaci%C3%B3n:ana\.perez\?secret=GEZD.*&issuer=Nexo%20Facturaci%C3%B3n&algorithm=SHA1&digits=6&period=30$/);
  assert.throws(() => base32Decode('ABC1'), /base32/);
});
test('TOTP accepts ±1 step, rejects other steps, malformed input and replays', () => {
  const secret = base32Encode(Buffer.from('nexo-secret-for-tests'));
  const now = 1_800_000_000_000; const step = currentStep(now);
  assert.equal(verifyTotp(secret, totpCode(secret, step), 0, now), step);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 1), 0, now), step - 1);
  assert.equal(verifyTotp(secret, totpCode(secret, step + 1), 0, now), step + 1);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 2), 0, now), 0);
  assert.equal(verifyTotp(secret, totpCode(secret, step), step, now), 0, 'un código ya usado no vale otra vez');
  assert.equal(verifyTotp(secret, ` ${totpCode(secret, step).slice(0, 3)} ${totpCode(secret, step).slice(3)} `, 0, now), step, 'tolera espacios');
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, 123456]) assert.equal(verifyTotp(secret, bad, 0, now), bad === 123456 && totpCode(secret, step) === '123456' ? step : 0);
});
test('recovery codes are random, hashed and single-use, case and dash insensitive', () => {
  const { codes, hashes } = generateRecoveryCodes();
  assert.equal(codes.length, 10); assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.ok(hashes.every(h => /^[0-9a-f]{64}$/.test(h) && !codes.includes(h)));
  const remaining = consumeRecoveryCode(hashes, codes[3].toLowerCase().replace('-', ' '));
  assert.ok(remaining); assert.equal(remaining!.length, 9);
  assert.equal(consumeRecoveryCode(remaining!, codes[3]), null, 'no se puede reutilizar');
  assert.equal(consumeRecoveryCode(hashes, 'AAAAA-AAAAA'), null);
});

/* ------------------------------------------------------------------- copias cifradas */
test('backups are encrypted with AES-256-GCM, detect tampering and reject wrong keys', () => {
  const key = 'clave-de-copias-muy-larga-2026'; const plain = Buffer.from('SQLite format 3\u0000 contenido de prueba');
  const encrypted = encryptBackup(plain, key);
  assert.equal(encrypted.subarray(0, 8).toString(), 'NEXOENC1'); assert.ok(!encrypted.includes(Buffer.from('contenido de prueba')));
  assert.deepEqual(decryptBackup(encrypted, key), plain);
  assert.notDeepEqual(encryptBackup(plain, key), encrypted, 'sal e IV aleatorios en cada copia');
  assert.throws(() => decryptBackup(encrypted, 'otra-clave-distinta-larga'), /clave no es correcta|dañado/);
  const tampered = Buffer.from(encrypted); tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBackup(tampered, key), /clave no es correcta|dañado/);
  assert.throws(() => decryptBackup(encrypted, ''), /BACKUP_KEY/);
  assert.throws(() => encryptBackup(plain, 'corta'), /16 caracteres/);
});
test('createBackup copies without sessions, rotates, verifies and restores with a safety copy', () => {
  const key = 'clave-de-copias-muy-larga-2026'; const backups = path.join(directory, 'copias-prueba');
  const source = path.join(directory, 'origen.sqlite'); const sourceDb = new DatabaseSync(source);
  sourceDb.exec("CREATE TABLE invoices (id TEXT); INSERT INTO invoices VALUES ('a'),('b'); CREATE TABLE user_sessions (token_hash TEXT); INSERT INTO user_sessions VALUES ('secreto'); CREATE TABLE login_failures (failure_key TEXT); INSERT INTO login_failures VALUES ('x|1')");
  sourceDb.close();
  const dates = ['2026-01-01T02:00:00Z', '2026-01-02T02:00:00Z', '2026-01-03T02:00:00Z'];
  const created = dates.map(d => createBackup(source, { directory: backups, key, keep: 2, now: new Date(d) }));
  assert.ok(created.every(c => c.encrypted && c.name.endsWith('.sqlite.gz.enc')));
  // mtime del sistema de archivos decide el orden; fijamos fechas explícitas para la rotación.
  assert.equal(listBackups(backups).length, 2, 'rotación: se conservan 2');
  const file = path.join(backups, created.at(-1)!.name);
  const raw = fs.readFileSync(file); assert.ok(!raw.includes(Buffer.from('SQLite format 3')));
  const check = verifyBackup(file, key); assert.equal(check.integrity, 'ok'); assert.equal(check.tables.invoices, 2); assert.equal(check.encrypted, true);
  const copy = path.join(directory, 'verificada.sqlite'); fs.writeFileSync(copy, readBackupDatabase(raw, key));
  const opened = new DatabaseSync(copy, { readOnly: true });
  assert.equal((opened.prepare('SELECT COUNT(*) AS n FROM user_sessions').get() as { n: number }).n, 0, 'las sesiones nunca se copian');
  assert.equal((opened.prepare('SELECT COUNT(*) AS n FROM login_failures').get() as { n: number }).n, 0); opened.close();
  assert.throws(() => verifyBackup(file, 'otra-clave-distinta-larga'), /clave/);
  // Restaurar sobre una base modificada recupera el contenido de la copia y guarda la anterior.
  const target = path.join(directory, 'restaurar.sqlite'); const t = new DatabaseSync(target); t.exec("CREATE TABLE invoices (id TEXT); INSERT INTO invoices VALUES ('z')"); t.close();
  const { safetyCopy } = restoreBackup(file, { target, key });
  assert.ok(fs.existsSync(safetyCopy));
  const restored = new DatabaseSync(target, { readOnly: true }); assert.equal((restored.prepare('SELECT COUNT(*) AS n FROM invoices').get() as { n: number }).n, 2); restored.close();
  const previous = new DatabaseSync(safetyCopy, { readOnly: true }); assert.equal((previous.prepare('SELECT id FROM invoices').get() as { id: string }).id, 'z'); previous.close();
  // Sin clave: comprimida pero legible, y también se verifica.
  const plainBackup = createBackup(source, { directory: backups, key: '', keep: 10 });
  assert.equal(plainBackup.encrypted, false); assert.equal(verifyBackup(path.join(backups, plainBackup.name), '').integrity, 'ok');
});

/* ------------------------------------------------------------------ cabeceras y CSRF */
test('mutations require the anti-CSRF header and a same-origin request', async () => {
  const missing = await call('/api/login', 'POST', { username: 'admin', password: ADMIN_PASSWORD }, '', origin, {});
  assert.equal(missing.status, 403); assert.equal(missing.body.code, 'CSRF_HEADER_MISSING'); assert.equal(missing.cookie, '');
  assert.equal((await call('/api/login', 'POST', { username: 'admin', password: ADMIN_PASSWORD }, '', origin, { 'X-Nexo-Request': '1', Origin: 'https://evil.example' })).status, 403);
  const cookie = await login('admin', ADMIN_PASSWORD);
  assert.equal((await call('/api/clients', 'POST', { name: 'X' }, cookie, origin, {})).status, 403);
  assert.equal((await call('/api/clients', 'GET', undefined, cookie, origin, {})).status, 200, 'las lecturas no necesitan la cabecera');
});
test('production headers: CSP without inline scripts, frame protection, COOP/CORP and no HSTS on plain HTTP', async () => {
  const strict = await fetch(`${strictOrigin}/api/health`);
  const csp = strict.headers.get('content-security-policy')!;
  assert.match(csp, /default-src 'self'/); assert.match(csp, /script-src 'self'(;|$)/); assert.match(csp, /object-src 'none'/); assert.match(csp, /frame-ancestors 'self'/); assert.match(csp, /base-uri 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
  assert.equal(strict.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(strict.headers.get('cross-origin-opener-policy'), 'same-origin'); assert.equal(strict.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(strict.headers.get('x-content-type-options'), 'nosniff'); assert.match(strict.headers.get('permissions-policy')!, /camera=\(\)/);
  assert.equal(strict.headers.get('strict-transport-security'), null, 'HSTS solo por HTTPS');
  const relaxed = await fetch(`${origin}/api/health`);
  assert.equal(relaxed.headers.get('content-security-policy'), null, 'en desarrollo Vite necesita scripts en línea'); assert.equal(relaxed.headers.get('x-content-type-options'), 'nosniff');
});

/* ------------------------------------------------------------------------ bloqueo */
test('five failed logins lock the user+IP for five minutes, even with the right password', async () => {
  await call('/api/users', 'POST', { username: 'bloqueo', displayName: 'Prueba Bloqueo', role: 'lectura', password: 'contraseña-bloqueo-123', mustChangePassword: false }, await login('admin', ADMIN_PASSWORD));
  const attempts = [];
  for (let i = 0; i < 5; i++) attempts.push(await call('/api/login', 'POST', { username: 'bloqueo', password: `incorrecta-${i}` }));
  assert.deepEqual(attempts.map(a => a.status), [401, 401, 401, 401, 429]);
  assert.match(attempts[0].body.error, /Te quedan 4 intentos/); assert.match(attempts[3].body.error, /Te queda 1 intento/);
  assert.match(attempts[4].body.error, /bloqueado 5 minutos/); assert.equal(attempts[4].body.code, 'LOGIN_LOCKED');
  const correct = await call('/api/login', 'POST', { username: 'bloqueo', password: 'contraseña-bloqueo-123' });
  assert.equal(correct.status, 429); assert.equal(correct.cookie, ''); assert.match(correct.body.error, /Espera 5 min/);
  const events = await call('/api/security-events', 'GET', undefined, await login('admin', ADMIN_PASSWORD));
  assert.ok(events.body.some((e: any) => e.type === 'login_locked' && e.targetName === 'bloqueo'));
  // Otra cuenta desde la misma IP no queda afectada.
  assert.equal((await call('/api/login', 'POST', { username: 'admin', password: ADMIN_PASSWORD })).status, 200);
});
test('lock counters expire, reset after success and survive as stored rows', () => {
  const key = 'reloj|10.0.0.1'; const t0 = 1_900_000_000_000;
  for (let i = 1; i <= 4; i++) assert.equal(registerLoginFailure(key, t0 + i).remaining, 5 - i);
  const locked = registerLoginFailure(key, t0 + 5); assert.equal(locked.lockedMs, 5 * 60_000);
  assert.ok(loginLockRemainingMs(key, t0 + 60_000) > 0); assert.equal(loginLockRemainingMs(key, t0 + 5 * 60_000 + 6), 0);
  assert.equal(registerLoginFailure(key, t0 + 6 * 60_000).remaining, 4, 'tras el bloqueo se empieza de cero');
  clearLoginFailures(key); assert.equal(registerLoginFailure(key, t0 + 7 * 60_000).remaining, 4);
  assert.equal(registerLoginFailure(key, t0 + 30 * 60_000).remaining, 4, 'los fallos antiguos se olvidan');
});

/* ----------------------------------------------------------- verificación en dos pasos */
test('2FA: setup, activation, two-step login, replay protection, recovery codes, disable', async () => {
  const admin = await login('admin', ADMIN_PASSWORD);
  assert.equal((await call('/api/users', 'POST', { username: 'ana.2fa', displayName: 'Ana Dos Pasos', role: 'gestor', password: 'contraseña-de-ana-2026', mustChangePassword: false }, admin)).status, 201);
  let cookie = await login('ana.2fa', 'contraseña-de-ana-2026');
  assert.equal((await call('/api/me/2fa/enable', 'POST', { code: '123456' }, cookie)).status, 400, 'primero hay que generar el QR');
  const setup = await call('/api/me/2fa/setup', 'POST', {}, cookie);
  assert.equal(setup.status, 200); assert.match(setup.body.secret, /^[A-Z2-7]{32}$/); assert.match(setup.body.otpauthUri, /^otpauth:\/\/totp\//); assert.match(setup.body.qrSvg, /^<svg/);
  const secret = setup.body.secret as string;
  const wrong = await call('/api/me/2fa/enable', 'POST', { code: totpCode(secret, currentStep() - 5) }, cookie); assert.equal(wrong.status, 400);
  const enableStep = currentStep(); // fijo: evita fallos si cambia el periodo de 30 s durante la prueba
  const enabled = await call('/api/me/2fa/enable', 'POST', { code: totpCode(secret, enableStep) }, cookie);
  assert.equal(enabled.status, 200, JSON.stringify(enabled.body)); assert.equal(enabled.body.recoveryCodes.length, 10); assert.equal(enabled.body.session.user.twoFactorEnabled, true);
  const recovery = enabled.body.recoveryCodes as string[];
  assert.equal((await call('/api/me/2fa/setup', 'POST', {}, cookie)).status, 400, 'no se puede regenerar el secreto con 2FA activa');
  const stored = db.prepare('SELECT totp_secret, recovery_codes FROM users WHERE username=?').get('ana.2fa') as { totp_secret: string; recovery_codes: string };
  assert.ok(!recovery.some(code => stored.recovery_codes.includes(code)), 'los códigos de recuperación solo se guardan como huellas');

  // Inicio de sesión en dos pasos: la contraseña sola no abre sesión.
  await call('/api/logout', 'POST', {}, cookie);
  const first = await call('/api/login', 'POST', { username: 'ana.2fa', password: 'contraseña-de-ana-2026' });
  assert.equal(first.status, 200); assert.equal(first.body.twoFactorRequired, true); assert.equal(first.cookie, ''); assert.ok(first.body.challenge.length > 20);
  const badCode = await call('/api/login/2fa', 'POST', { challenge: first.body.challenge, code: 'ABCDE-FGHJK' });
  assert.equal(badCode.status, 401); assert.match(badCode.body.error, /Te quedan 4 intentos/);
  // El código usado al activar ya no vale (protección contra reutilización); el siguiente periodo sí.
  const replay = await call('/api/login/2fa', 'POST', { challenge: first.body.challenge, code: totpCode(secret, enableStep) });
  assert.equal(replay.status, 401, 'un código ya usado no se acepta dos veces');
  const ok = await call('/api/login/2fa', 'POST', { challenge: first.body.challenge, code: totpCode(secret, enableStep + 1) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.ok(ok.cookie); assert.equal(ok.body.user.username, 'ana.2fa');
  assert.equal((await call('/api/login/2fa', 'POST', { challenge: first.body.challenge, code: totpCode(secret, currentStep()) })).status, 401, 'el reto es de un solo uso');
  cookie = ok.cookie;

  // Código de recuperación: funciona una vez y lo registra.
  await call('/api/logout', 'POST', {}, cookie);
  const second = await call('/api/login', 'POST', { username: 'ana.2fa', password: 'contraseña-de-ana-2026' });
  const viaRecovery = await call('/api/login/2fa', 'POST', { challenge: second.body.challenge, code: recovery[0].toLowerCase() });
  assert.equal(viaRecovery.status, 200); assert.equal(viaRecovery.body.recoveryCodesLeft, 9); cookie = viaRecovery.cookie;
  const third = await call('/api/login', 'POST', { username: 'ana.2fa', password: 'contraseña-de-ana-2026' });
  assert.equal((await call('/api/login/2fa', 'POST', { challenge: third.body.challenge, code: recovery[0] })).status, 401, 'cada código de recuperación sirve una sola vez');
  assert.equal((await call('/api/me/security', 'GET', undefined, cookie)).body.recoveryCodesLeft, 9);

  // Regenerar códigos exige un código actual; desactivar exige contraseña y código.
  resetReplay('ana.2fa');
  const regenerated = await call('/api/me/2fa/recovery-codes', 'POST', { code: nextCode(secret) }, cookie);
  assert.equal(regenerated.status, 200); assert.equal(regenerated.body.recoveryCodes.length, 10);
  assert.equal((await call('/api/me/2fa/disable', 'POST', { password: 'mala-contraseña', code: regenerated.body.recoveryCodes[0] }, cookie)).status, 400);
  assert.equal((await call('/api/me/2fa/disable', 'POST', { password: 'contraseña-de-ana-2026', code: '000000' }, cookie)).status, 400);
  const disabled = await call('/api/me/2fa/disable', 'POST', { password: 'contraseña-de-ana-2026', code: regenerated.body.recoveryCodes[1] }, cookie);
  assert.equal(disabled.status, 200); assert.equal(disabled.body.user.twoFactorEnabled, false);
  assert.ok((await call('/api/login', 'POST', { username: 'ana.2fa', password: 'contraseña-de-ana-2026' })).cookie, 'sin 2FA vuelve a bastar la contraseña');

  const events = (await call('/api/security-events', 'GET', undefined, admin)).body.map((e: any) => e.type);
  for (const type of ['two_factor_enabled', 'two_factor_failed', 'recovery_code_used', 'recovery_codes_regenerated', 'two_factor_disabled']) assert.ok(events.includes(type), type);
});
test('2FA: wrong codes count toward the lockout and an admin can reset a lost device', async () => {
  const admin = await login('admin', ADMIN_PASSWORD);
  const created = await call('/api/users', 'POST', { username: 'luis.2fa', displayName: 'Luis Teléfono', role: 'tecnico', password: 'contraseña-de-luis-2026', mustChangePassword: false }, admin);
  let cookie = await login('luis.2fa', 'contraseña-de-luis-2026');
  const { secret } = (await call('/api/me/2fa/setup', 'POST', {}, cookie)).body;
  assert.equal((await call('/api/me/2fa/enable', 'POST', { code: nextCode(secret) }, cookie)).status, 200);
  const challenge = (await call('/api/login', 'POST', { username: 'luis.2fa', password: 'contraseña-de-luis-2026' })).body.challenge;
  const statuses = []; for (let i = 0; i < 5; i++) statuses.push((await call('/api/login/2fa', 'POST', { challenge, code: 'AAAAA-AAAAA' })).status);
  assert.deepEqual(statuses, [401, 401, 401, 401, 429]);
  assert.equal((await call('/api/login', 'POST', { username: 'luis.2fa', password: 'contraseña-de-luis-2026' })).status, 429, 'la cuenta queda bloqueada en esta IP');
  db.prepare('DELETE FROM login_failures').run();

  assert.equal((await call(`/api/users/${created.body.id}`, 'PUT', { resetTwoFactor: true }, cookie)).status, 403, 'solo administradores');
  const adminId = (await call('/api/session', 'GET', undefined, admin)).body.user.id;
  assert.equal((await call(`/api/users/${adminId}`, 'PUT', { resetTwoFactor: true }, admin)).status, 400, 'la propia 2FA se gestiona desde Mi cuenta');
  const reset = await call(`/api/users/${created.body.id}`, 'PUT', { resetTwoFactor: true }, admin);
  assert.equal(reset.status, 200); assert.equal(reset.body.twoFactorEnabled, false);
  assert.equal((await call('/api/session', 'GET', undefined, cookie)).body.authenticated, false, 'se cierran sus sesiones');
  cookie = await login('luis.2fa', 'contraseña-de-luis-2026');
  assert.equal((await call(`/api/users/${created.body.id}`, 'PUT', { resetTwoFactor: true }, admin)).status, 400, 'no tiene 2FA que restablecer');
  assert.ok((await call('/api/security-events', 'GET', undefined, admin)).body.some((e: any) => e.type === 'two_factor_reset' && e.targetName === 'luis.2fa'));
});
test('REQUIRE_ADMIN_2FA keeps admins out of business data until they enable it', async () => {
  db.prepare('DELETE FROM login_failures').run();
  const admin = await login('admin', ADMIN_PASSWORD, strictOrigin);
  const session = await call('/api/session', 'GET', undefined, admin, strictOrigin);
  assert.equal(session.body.twoFactorSetupRequired, true);
  const blocked = await call('/api/invoices', 'GET', undefined, admin, strictOrigin); assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'TWO_FACTOR_SETUP_REQUIRED');
  assert.equal((await call('/api/me/sessions', 'GET', undefined, admin, strictOrigin)).status, 200, 'su cuenta sigue accesible');
  const gestor = await login('ana.2fa', 'contraseña-de-ana-2026', strictOrigin);
  assert.equal((await call('/api/invoices', 'GET', undefined, gestor, strictOrigin)).status, 200, 'la política solo afecta a administradores');
  const { secret } = (await call('/api/me/2fa/setup', 'POST', {}, admin, strictOrigin)).body;
  assert.equal((await call('/api/me/2fa/enable', 'POST', { code: nextCode(secret) }, admin, strictOrigin)).status, 200);
  assert.equal((await call('/api/invoices', 'GET', undefined, admin, strictOrigin)).status, 200);
  assert.equal((await call('/api/me/2fa/disable', 'POST', { password: ADMIN_PASSWORD, code: '000000' }, admin, strictOrigin)).status, 403, 'la política impide desactivarla');
  // Deja al administrador sin 2FA para el resto de pruebas.
  db.prepare("UPDATE users SET totp_secret='', totp_enabled=0, totp_last_step=0, recovery_codes='[]' WHERE username='admin'").run();
});

/* ------------------------------------------------------------------------ sesiones */
test('sessions expire after inactivity, report the reason and can be listed and closed by their owner', async () => {
  db.prepare('DELETE FROM login_failures').run();
  const phone = await login('ana.2fa', 'contraseña-de-ana-2026'); const laptop = await login('ana.2fa', 'contraseña-de-ana-2026'); const tablet = await login('ana.2fa', 'contraseña-de-ana-2026');
  const info = (await call('/api/session', 'GET', undefined, laptop)).body;
  assert.equal(info.idleMinutes, 30); assert.ok(info.idleRemainingSeconds > 29 * 60 && info.idleRemainingSeconds <= 30 * 60);
  const sessions = (await call('/api/me/sessions', 'GET', undefined, laptop)).body as { id: string; current: boolean }[];
  assert.ok(sessions.length >= 3); assert.equal(sessions.filter(s => s.current).length, 1); assert.ok(sessions.every(s => /^[0-9a-f]{16}$/.test(s.id)));
  const current = sessions.find(s => s.current)!;
  assert.equal((await call(`/api/me/sessions/${current.id}`, 'DELETE', undefined, laptop)).status, 400, 'la actual se cierra con «Cerrar sesión»');
  assert.equal((await call('/api/me/sessions/ffffffffffffffff', 'DELETE', undefined, laptop)).status, 404);
  const phoneId = (await call('/api/me/sessions', 'GET', undefined, phone)).body.find((s: any) => s.current).id;
  assert.equal((await call(`/api/me/sessions/${phoneId}`, 'DELETE', undefined, laptop)).body.revoked, 1);
  assert.equal((await call('/api/session', 'GET', undefined, phone)).body.authenticated, false);
  // Ana no puede cerrar sesiones de otra persona aunque conozca su id.
  const admin = await login('admin', ADMIN_PASSWORD);
  const adminSessionId = (await call('/api/me/sessions', 'GET', undefined, admin)).body.find((s: any) => s.current).id;
  assert.equal((await call(`/api/me/sessions/${adminSessionId}`, 'DELETE', undefined, laptop)).status, 404);
  assert.equal((await call('/api/session', 'GET', undefined, admin)).body.authenticated, true);

  // Inactividad: el servidor cierra la sesión y lo explica.
  db.prepare("UPDATE user_sessions SET last_seen_at=? WHERE user_id=(SELECT id FROM users WHERE username='ana.2fa')").run(Date.now() - 31 * 60_000);
  const idle = await call('/api/invoices', 'GET', undefined, tablet);
  assert.equal(idle.status, 401); assert.equal(idle.body.code, 'SESSION_IDLE'); assert.match(idle.body.error, /inactividad/);
  const after = await call('/api/session', 'GET', undefined, laptop); assert.equal(after.body.authenticated, false); assert.equal(after.body.expiredReason, 'idle');
  assert.ok((await call('/api/security-events', 'GET', undefined, admin)).body.some((e: any) => e.type === 'session_expired' && e.details.reason === 'idle'));

  // ?probe=1 consulta sin contar como actividad.
  const probeCookie = await login('ana.2fa', 'contraseña-de-ana-2026');
  db.prepare("UPDATE user_sessions SET last_seen_at=? WHERE user_id=(SELECT id FROM users WHERE username='ana.2fa')").run(Date.now() - 10 * 60_000);
  const probed = (await call('/api/session?probe=1', 'GET', undefined, probeCookie)).body; assert.ok(probed.idleRemainingSeconds <= 20 * 60 + 1);
  const touched = (await call('/api/session', 'GET', undefined, probeCookie)).body; assert.ok(touched.idleRemainingSeconds > 29 * 60);
  const others = await call('/api/me/sessions/others', 'DELETE', undefined, probeCookie); assert.equal(others.status, 200);
});

/* ------------------------------------------------------------------------- copias */
test('admins can create, list and download backups; other roles cannot', async () => {
  const admin = await login('admin', ADMIN_PASSWORD); const gestor = await login('ana.2fa', 'contraseña-de-ana-2026');
  assert.equal((await call('/api/backups', 'GET', undefined, gestor)).status, 403);
  assert.equal((await call('/api/backups', 'POST', {}, gestor)).status, 403);
  const created = await call('/api/backups', 'POST', {}, admin);
  assert.equal(created.status, 201); assert.equal(created.body.encrypted, false); assert.ok(created.body.backups.length >= 1);
  const name = created.body.backups[0].name as string; assert.match(name, /^nexo-.*\.sqlite\.gz$/);
  const download = await fetch(`${origin}/api/backups/${name}`, { headers: { Cookie: admin } });
  assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition')!, /attachment/);
  const bytes = Buffer.from(await download.arrayBuffer()); assert.equal(bytes[0], 0x1f); assert.equal(bytes[1], 0x8b);
  for (const bad of ['..%2Ffacturacion.sqlite', 'facturacion.sqlite', 'nexo-2026-01-01.sqlite.gz']) assert.equal((await fetch(`${origin}/api/backups/${bad}`, { headers: { Cookie: admin } })).status, 404, bad);
  const events = (await call('/api/security-events', 'GET', undefined, admin)).body.map((e: any) => e.type);
  assert.ok(events.includes('backup_created')); assert.ok(events.includes('backup_downloaded'));
});
