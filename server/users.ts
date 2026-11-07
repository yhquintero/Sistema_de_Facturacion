import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, scryptSync, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { validate } from './validation';
import { consumeRecoveryCode, generateRecoveryCodes, generateTotpSecret, otpauthUri, verifyTotp } from './totp';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USER_ROLES, USERNAME_PATTERN, type OwnSession, type SecurityEvent, type SessionUser, type UserRole, type WorkspaceUser } from '../shared/permissions';

/* ============================================================================
 * CUENTAS, CONTRASEÑAS Y SESIONES
 * - Contraseñas con scrypt (sal aleatoria por cuenta), nunca en texto plano.
 * - Las sesiones se guardan como SHA-256 del token: la cookie no es reutilizable desde la base.
 * - El rol se lee en cada solicitud: un cambio de rol o una desactivación tienen efecto inmediato.
 * ============================================================================ */

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (${USER_ROLES.map(r => `'${r}'`).join(',')})),
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL DEFAULT '',
    password_changed_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS user_sessions_user_index ON user_sessions(user_id);
  CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    actor_id TEXT NOT NULL DEFAULT '',
    actor_name TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    target_name TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    details_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS login_failures (
    failure_key TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`);
/** Migraciones aditivas: columnas nuevas en bases creadas por versiones anteriores. */
function addColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('users', 'totp_secret', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'totp_pending', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'totp_last_step', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'recovery_codes', "TEXT NOT NULL DEFAULT '[]'");
addColumn('user_sessions', 'last_seen_at', 'INTEGER NOT NULL DEFAULT 0');

/* ------------------------------------------------------------------ política de sesiones */
const envNumber = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]); return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};
/** Cierre por inactividad (SESSION_IDLE_MINUTES, 30 por defecto; 0 lo desactiva). */
export const sessionIdleMs = () => envNumber('SESSION_IDLE_MINUTES', 30, 0, 24 * 60) * 60_000;
/** Duración máxima absoluta de una sesión (SESSION_MAX_HOURS, 12 por defecto). */
export const sessionMaxMs = () => envNumber('SESSION_MAX_HOURS', 12, 1, 24 * 30) * 60 * 60_000;
/** Bloqueo por intentos fallidos: LOGIN_MAX_ATTEMPTS (5) en LOGIN_LOCK_MINUTES (5). */
export const loginMaxAttempts = () => envNumber('LOGIN_MAX_ATTEMPTS', 5, 1, 100);
export const loginLockMs = () => envNumber('LOGIN_LOCK_MINUTES', 5, 1, 24 * 60) * 60_000;
const SEEN_RESOLUTION_MS = 30_000;
const MAX_SESSIONS_PER_USER = 20;
const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, keyLength, options, (error, key) => error ? reject(error) : resolve(key)));
}
const SCRYPT_OPTIONS = { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 };
const formatHash = (salt: Buffer, key: Buffer) => `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return formatHash(salt, await scrypt(password.normalize('NFKC'), salt, SCRYPT.keyLength, SCRYPT_OPTIONS));
}
/** Solo para el arranque (una vez); el resto de operaciones usa la versión asíncrona. */
function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  return formatHash(salt, scryptSync(password.normalize('NFKC'), salt, SCRYPT.keyLength, SCRYPT_OPTIONS));
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
/** Hash señuelo para igualar el tiempo de respuesta cuando el usuario no existe. */
let decoyHash: Promise<string> | undefined;
export function getDecoyHash() { return (decoyHash ??= hashPassword(randomBytes(24).toString('hex'))); }

const password = z.string().min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`).max(PASSWORD_MAX_LENGTH, `Máximo ${PASSWORD_MAX_LENGTH} caracteres.`).refine(value => value.trim().length >= PASSWORD_MIN_LENGTH, 'La contraseña no puede estar formada solo por espacios.');
const username = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, 'Usuario: 3 a 40 caracteres en minúscula (letras, números, punto, guion o guion bajo), empezando por letra o número.');
const displayName = z.string().trim().min(1, 'Indica el nombre de la persona.').max(120, 'Máximo 120 caracteres.');
const role = z.enum(USER_ROLES, { error: 'Rol no válido.' });
export const createUserSchema = z.object({ username, displayName, role, password, mustChangePassword: z.boolean().default(true) });
export const updateUserSchema = z.object({ displayName: displayName.optional(), role: role.optional(), active: z.boolean().optional(), password: password.optional(), mustChangePassword: z.boolean().optional(), resetTwoFactor: z.literal(true).optional() });
export const setupSchema = z.object({ username, displayName, password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1, 'Indica tu contraseña actual.').max(PASSWORD_MAX_LENGTH), newPassword: password });

type UserRow = { id: string; username: string; display_name: string; role: UserRole; password_hash: string; active: number; must_change_password: number; created_at: string; updated_at: string; last_login_at: string; password_changed_at: string; totp_secret: string; totp_pending: string; totp_enabled: number; totp_last_step: number; recovery_codes: string };
const recoveryHashes = (row: UserRow): string[] => { try { const list = JSON.parse(row.recovery_codes || '[]'); return Array.isArray(list) ? list.filter(x => typeof x === 'string') : []; } catch { return []; } };
const toWorkspaceUser = (row: UserRow): WorkspaceUser => ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role, mustChangePassword: !!row.must_change_password, twoFactorEnabled: !!row.totp_enabled, active: !!row.active, createdAt: row.created_at, updatedAt: row.updated_at, lastLoginAt: row.last_login_at, passwordChangedAt: row.password_changed_at, recoveryCodesLeft: row.totp_enabled ? recoveryHashes(row).length : 0 });
export const toSessionUser = (user: WorkspaceUser): SessionUser => ({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, mustChangePassword: user.mustChangePassword, twoFactorEnabled: user.twoFactorEnabled });
const userRow = (id: string) => db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow | undefined;

export function countUsers(): number { return Number((db.prepare('SELECT COUNT(*) AS total FROM users').get() as { total: number }).total); }
export function hasUsers(): boolean { return !!db.prepare('SELECT 1 FROM users LIMIT 1').get(); }
export function getUser(id: string): WorkspaceUser | undefined { const row = userRow(id); return row ? toWorkspaceUser(row) : undefined; }
export function findUserForLogin(name: string): (WorkspaceUser & { passwordHash: string }) | undefined {
  const row = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(name.trim()) as UserRow | undefined;
  return row ? { ...toWorkspaceUser(row), passwordHash: row.password_hash } : undefined;
}
export function listUsers(): (WorkspaceUser & { activeSessions: number })[] {
  const now = Date.now();
  return (db.prepare("SELECT u.*, (SELECT COUNT(*) FROM user_sessions s WHERE s.user_id=u.id AND s.expires_at > ?) AS active_sessions FROM users u ORDER BY u.active DESC, CASE u.role WHEN 'admin' THEN 0 WHEN 'gestor' THEN 1 WHEN 'tecnico' THEN 2 ELSE 3 END, u.display_name COLLATE NOCASE").all(now) as (UserRow & { active_sessions: number })[])
    .map(row => ({ ...toWorkspaceUser(row), activeSessions: Number(row.active_sessions) }));
}
function activeAdminCount(excludingId = ''): number { return Number((db.prepare("SELECT COUNT(*) AS total FROM users WHERE role='admin' AND active=1 AND id != ?").get(excludingId) as { total: number }).total); }

export type ActorRef = { id: string; name: string; ip?: string };
export function recordSecurityEvent(type: string, actor: ActorRef | null, target: { id?: string; name?: string } = {}, details: object = {}) {
  db.prepare('INSERT INTO security_events (event_type,occurred_at,actor_id,actor_name,target_id,target_name,ip,details_json) VALUES (?,?,?,?,?,?,?,?)')
    .run(type, new Date().toISOString(), actor?.id || '', actor?.name || '', target.id || '', (target.name || '').slice(0, 120), (actor?.ip || '').slice(0, 64), JSON.stringify(details));
  db.prepare('DELETE FROM security_events WHERE id <= (SELECT id FROM security_events ORDER BY id DESC LIMIT 1 OFFSET 5000)').run();
}
export function listSecurityEvents(limit = 100): SecurityEvent[] {
  return (db.prepare('SELECT * FROM security_events ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(limit, 1), 500)) as Record<string, string | number>[])
    .map(row => ({ id: Number(row.id), type: String(row.event_type), occurredAt: String(row.occurred_at), actorName: String(row.actor_name), targetName: String(row.target_name), ip: String(row.ip), details: JSON.parse(String(row.details_json || '{}')) }));
}

export async function createUser(input: unknown, actor: ActorRef | null): Promise<WorkspaceUser> {
  const data = validate(createUserSchema, input);
  if (findUserForLogin(data.username)) throw new Error(`El usuario «${data.username}» ya existe.`);
  return insertUser(data, await hashPassword(data.password), actor);
}
/** Primer administrador creado desde la interfaz (solo si aún no existe ninguna cuenta). */
export async function createFirstAdmin(input: unknown): Promise<WorkspaceUser> {
  const data = validate(setupSchema, input);
  const passwordHash = await hashPassword(data.password);
  if (hasUsers()) throw Object.assign(new Error('El control de acceso ya está activado. Inicia sesión con tu cuenta.'), { status: 409 });
  const user = insertUser({ ...data, role: 'admin', mustChangePassword: false }, passwordHash, { id: '', name: data.displayName });
  recordSecurityEvent('setup_admin', { id: user.id, name: user.displayName }, { id: user.id, name: user.username });
  return user;
}
function insertUser(data: z.infer<typeof createUserSchema>, passwordHash: string, actor: ActorRef | null): WorkspaceUser {
  const now = new Date().toISOString(); const id = `usr-${randomUUID()}`;
  if (findUserForLogin(data.username)) throw new Error(`El usuario «${data.username}» ya existe.`);
  db.prepare('INSERT INTO users (id,username,display_name,role,password_hash,active,must_change_password,created_at,updated_at,password_changed_at) VALUES (?,?,?,?,?,1,?,?,?,?)')
    .run(id, data.username, data.displayName, data.role, passwordHash, Number(data.mustChangePassword), now, now, now);
  recordSecurityEvent('user_created', actor, { id, name: data.username }, { role: data.role, mustChangePassword: data.mustChangePassword });
  return getUser(id)!;
}

export async function updateUser(id: string, input: unknown, actor: ActorRef): Promise<WorkspaceUser> {
  const data = validate(updateUserSchema, input);
  const current = getUser(id); if (!current) throw new Error('Usuario no encontrado.');
  const self = id === actor.id;
  if (self && ((data.role && data.role !== current.role) || data.active === false)) throw new Error('No puedes cambiar tu propio rol ni desactivar tu propia cuenta. Pide a otro administrador que lo haga.');
  if (self && data.password) throw new Error('Para cambiar tu propia contraseña usa «Mi cuenta», que solicita la contraseña actual.');
  if (self && data.resetTwoFactor) throw new Error('Para desactivar tu propia verificación en dos pasos usa «Mi cuenta», que solicita tu contraseña y un código.');
  if (data.resetTwoFactor && !current.twoFactorEnabled) throw new Error('Esta cuenta no tiene activada la verificación en dos pasos.');
  const nextRole = data.role ?? current.role; const nextActive = data.active ?? current.active;
  if (current.role === 'admin' && current.active && (nextRole !== 'admin' || !nextActive) && activeAdminCount(id) === 0) throw new Error('Debe quedar al menos un administrador activo.');
  const passwordHash = data.password ? await hashPassword(data.password) : undefined;
  const now = new Date().toISOString();
  const mustChange = data.password ? (data.mustChangePassword ?? true) : (data.mustChangePassword ?? current.mustChangePassword);
  db.exec('BEGIN IMMEDIATE');
  try {
    const fresh = getUser(id); if (!fresh) throw new Error('Usuario no encontrado.');
    if (fresh.role === 'admin' && fresh.active && (nextRole !== 'admin' || !nextActive) && activeAdminCount(id) === 0) throw new Error('Debe quedar al menos un administrador activo.');
    db.prepare('UPDATE users SET display_name=?, role=?, active=?, must_change_password=?, updated_at=? WHERE id=?').run(data.displayName ?? current.displayName, nextRole, Number(nextActive), Number(mustChange), now, id);
    if (passwordHash) db.prepare('UPDATE users SET password_hash=?, password_changed_at=? WHERE id=?').run(passwordHash, now, id);
    if (data.resetTwoFactor) db.prepare("UPDATE users SET totp_secret='', totp_pending='', totp_enabled=0, totp_last_step=0, recovery_codes='[]' WHERE id=?").run(id);
    if (!nextActive || passwordHash || data.resetTwoFactor) db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const target = { id, name: current.username };
  if (nextRole !== current.role) recordSecurityEvent('role_changed', actor, target, { previous: current.role, role: nextRole });
  if (nextActive !== current.active) recordSecurityEvent(nextActive ? 'user_reactivated' : 'user_deactivated', actor, target);
  if (passwordHash) recordSecurityEvent('password_reset', actor, target, { mustChangePassword: mustChange });
  if (data.resetTwoFactor) recordSecurityEvent('two_factor_reset', actor, target);
  if (data.displayName && data.displayName !== current.displayName) recordSecurityEvent('user_updated', actor, target, { displayName: data.displayName });
  return getUser(id)!;
}

export async function changeOwnPassword(id: string, input: unknown, keepTokenHash: string, actor: ActorRef): Promise<WorkspaceUser> {
  const data = validate(changePasswordSchema, input);
  const row = userRow(id); if (!row || !row.active) throw new Error('Usuario no encontrado.');
  if (!(await verifyPassword(data.currentPassword, row.password_hash))) { recordSecurityEvent('password_change_failed', actor, { id, name: row.username }); throw new Error('La contraseña actual no es correcta.'); }
  if (data.currentPassword === data.newPassword) throw new Error('La nueva contraseña debe ser distinta de la actual.');
  const hash = await hashPassword(data.newPassword); const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash=?, must_change_password=0, password_changed_at=?, updated_at=? WHERE id=?').run(hash, now, now, id);
  db.prepare('DELETE FROM user_sessions WHERE user_id=? AND token_hash != ?').run(id, keepTokenHash);
  recordSecurityEvent('password_changed', actor, { id, name: row.username });
  return getUser(id)!;
}

/** Restablecimiento desde la consola del servidor (recuperación de acceso). */
export function resetTwoFactorFromConsole(name: string): WorkspaceUser {
  const existing = findUserForLogin(name); if (!existing) throw new Error(`No existe el usuario «${name}».`);
  db.prepare("UPDATE users SET totp_secret='', totp_pending='', totp_enabled=0, totp_last_step=0, recovery_codes='[]', updated_at=? WHERE id=?").run(new Date().toISOString(), existing.id);
  db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(existing.id);
  recordSecurityEvent('two_factor_reset', { id: '', name: 'Consola del servidor' }, { id: existing.id, name: existing.username });
  return getUser(existing.id)!;
}
export async function resetPasswordFromConsole(name: string, newPassword: string, options: { createAdmin?: boolean } = {}): Promise<{ user: WorkspaceUser; created: boolean }> {
  validate(password, newPassword);
  const existing = findUserForLogin(name);
  if (!existing) {
    if (!options.createAdmin) throw new Error(`No existe el usuario «${name}».`);
    return { user: await createUser({ username: name, displayName: 'Administrador', role: 'admin', password: newPassword, mustChangePassword: true }, { id: '', name: 'Consola del servidor' }), created: true };
  }
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET password_hash=?, must_change_password=1, active=1, password_changed_at=?, updated_at=?, role=CASE WHEN ? THEN 'admin' ELSE role END WHERE id=?").run(await hashPassword(newPassword), now, now, Number(!!options.createAdmin), existing.id);
  db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(existing.id);
  recordSecurityEvent('password_reset', { id: '', name: 'Consola del servidor' }, { id: existing.id, name: existing.username }, { mustChangePassword: true });
  return { user: getUser(existing.id)!, created: false };
}

const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');
export function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}): { token: string; tokenHash: string } {
  const now = Date.now();
  db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM user_sessions WHERE user_id=? AND token_hash IN (SELECT token_hash FROM user_sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT -1 OFFSET ?)').run(userId, userId, MAX_SESSIONS_PER_USER - 1);
  const token = randomBytes(32).toString('hex'); const tokenHash = tokenDigest(token);
  db.prepare('INSERT INTO user_sessions (token_hash,user_id,created_at,expires_at,ip,user_agent,last_seen_at) VALUES (?,?,?,?,?,?,?)').run(tokenHash, userId, new Date(now).toISOString(), now + sessionMaxMs(), (meta.ip || '').slice(0, 64), (meta.userAgent || '').slice(0, 300), now);
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(new Date(now).toISOString(), userId);
  return { token, tokenHash };
}
export type SessionResolution = { user: WorkspaceUser; tokenHash: string; lastSeenAt: number } | { expired: 'idle' | 'max'; user: WorkspaceUser } | null;
/**
 * Valida la cookie. Además de la caducidad absoluta, cierra la sesión si lleva más de
 * SESSION_IDLE_MINUTES sin actividad. `touch=false` consulta sin contar como actividad.
 */
export function resolveSession(token: string, options: { touch?: boolean; now?: number } = {}): SessionResolution {
  if (!token || token.length > 200) return null;
  const now = options.now ?? Date.now(); const tokenHash = tokenDigest(token);
  const row = db.prepare('SELECT user_id, expires_at, last_seen_at, created_at FROM user_sessions WHERE token_hash=?').get(tokenHash) as { user_id: string; expires_at: number; last_seen_at: number; created_at: string } | undefined;
  if (!row) return null;
  const user = getUser(row.user_id);
  if (!user || !user.active) { db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(tokenHash); return null; }
  const idle = sessionIdleMs(); const lastSeen = row.last_seen_at || Date.parse(row.created_at) || now;
  if (row.expires_at <= now || (idle > 0 && now - lastSeen > idle)) {
    db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(tokenHash);
    const reason = row.expires_at <= now ? 'max' : 'idle';
    recordSecurityEvent('session_expired', { id: user.id, name: user.displayName }, { id: user.id, name: user.username }, { reason });
    return { expired: reason, user };
  }
  if (options.touch !== false && now - lastSeen >= SEEN_RESOLUTION_MS) { db.prepare('UPDATE user_sessions SET last_seen_at=? WHERE token_hash=?').run(now, tokenHash); return { user, tokenHash, lastSeenAt: now }; }
  return { user, tokenHash, lastSeenAt: lastSeen };
}
const publicSessionId = (tokenHash: string) => tokenHash.slice(0, 16);
export function listOwnSessions(userId: string, currentTokenHash: string): OwnSession[] {
  const now = Date.now(); const idle = sessionIdleMs();
  return (db.prepare('SELECT * FROM user_sessions WHERE user_id=? AND expires_at > ? ORDER BY last_seen_at DESC, created_at DESC').all(userId, now) as { token_hash: string; created_at: string; expires_at: number; last_seen_at: number; ip: string; user_agent: string }[])
    .filter(row => !idle || now - (row.last_seen_at || Date.parse(row.created_at)) <= idle)
    .map(row => ({ id: publicSessionId(row.token_hash), current: row.token_hash === currentTokenHash, createdAt: row.created_at, lastSeenAt: new Date(row.last_seen_at || Date.parse(row.created_at)).toISOString(), expiresAt: new Date(row.expires_at).toISOString(), ip: row.ip, userAgent: row.user_agent }));
}
/** Cierra una sesión propia por id público, o todas salvo la actual con id «others». */
export function revokeOwnSessions(userId: string, sessionId: string, currentTokenHash: string, actor: ActorRef): number {
  const rows = db.prepare('SELECT token_hash FROM user_sessions WHERE user_id=?').all(userId) as { token_hash: string }[];
  const targets = rows.filter(r => r.token_hash !== currentTokenHash && (sessionId === 'others' || publicSessionId(r.token_hash) === sessionId));
  if (sessionId !== 'others' && !targets.length) {
    if (publicSessionId(currentTokenHash) === sessionId) throw new Error('Para cerrar la sesión actual usa «Cerrar sesión».');
    throw Object.assign(new Error('Sesión no encontrada o ya cerrada.'), { status: 404 });
  }
  const remove = db.prepare('DELETE FROM user_sessions WHERE token_hash=?'); for (const t of targets) remove.run(t.token_hash);
  if (targets.length) recordSecurityEvent('own_sessions_revoked', actor, { id: userId, name: actor.name }, { count: targets.length, scope: sessionId === 'others' ? 'others' : 'one' });
  return targets.length;
}

/* ============================================================================
 * BLOQUEO POR INTENTOS FALLIDOS (usuario + IP)
 * Tras LOGIN_MAX_ATTEMPTS fallos (contraseña o código de verificación) la combinación
 * queda bloqueada LOGIN_LOCK_MINUTES. Persistente: sobrevive a reinicios del servidor.
 * ============================================================================ */
export const failureKey = (name: string, ip: string) => `${name.trim().toLowerCase().slice(0, 80)}|${ip.slice(0, 64)}`;
export function loginLockRemainingMs(key: string, now = Date.now()): number {
  const row = db.prepare('SELECT locked_until FROM login_failures WHERE failure_key=?').get(key) as { locked_until: number } | undefined;
  return row && row.locked_until > now ? row.locked_until - now : 0;
}
/** Registra un fallo. Devuelve los intentos restantes y, si se acaba de bloquear, cuánto dura. */
export function registerLoginFailure(key: string, now = Date.now()): { remaining: number; lockedMs: number } {
  const max = loginMaxAttempts(); const lock = loginLockMs();
  db.prepare('DELETE FROM login_failures WHERE updated_at < ? AND locked_until < ?').run(now - 24 * 60 * 60_000, now);
  const row = db.prepare('SELECT failures, locked_until, updated_at FROM login_failures WHERE failure_key=?').get(key) as { failures: number; locked_until: number; updated_at: number } | undefined;
  // Los fallos se olvidan si pasó la ventana de bloqueo desde el último o si terminó un bloqueo anterior.
  const stale = !row || (row.locked_until && row.locked_until <= now) || now - row.updated_at > lock;
  const failures = (stale ? 0 : row!.failures) + 1;
  const lockedUntil = failures >= max ? now + lock : 0;
  db.prepare('INSERT INTO login_failures (failure_key,failures,locked_until,updated_at) VALUES (?,?,?,?) ON CONFLICT(failure_key) DO UPDATE SET failures=excluded.failures, locked_until=excluded.locked_until, updated_at=excluded.updated_at')
    .run(key, lockedUntil ? 0 : failures, lockedUntil, now);
  return { remaining: Math.max(0, max - failures), lockedMs: lockedUntil ? lock : 0 };
}
export function clearLoginFailures(key: string) { db.prepare('DELETE FROM login_failures WHERE failure_key=?').run(key); }

/* ============================================================================
 * VERIFICACIÓN EN DOS PASOS
 * ============================================================================ */
export function startTwoFactorSetup(id: string): { secret: string; otpauthUri: string } {
  const row = userRow(id); if (!row || !row.active) throw new Error('Usuario no encontrado.');
  if (row.totp_enabled) throw new Error('La verificación en dos pasos ya está activada. Desactívala primero si quieres cambiar de dispositivo.');
  const secret = generateTotpSecret();
  db.prepare('UPDATE users SET totp_pending=? WHERE id=?').run(secret, id);
  return { secret, otpauthUri: otpauthUri(secret, row.username) };
}
export function enableTwoFactor(id: string, code: unknown, actor: ActorRef): { codes: string[]; user: WorkspaceUser } {
  const row = userRow(id); if (!row || !row.active) throw new Error('Usuario no encontrado.');
  if (row.totp_enabled) throw new Error('La verificación en dos pasos ya está activada.');
  if (!row.totp_pending) throw new Error('Primero genera el código QR para tu aplicación de autenticación.');
  const step = verifyTotp(row.totp_pending, code);
  if (!step) { recordSecurityEvent('two_factor_failed', actor, { id, name: row.username }, { stage: 'activation' }); throw new Error('El código no es correcto. Comprueba que la hora del teléfono es automática e inténtalo con el siguiente código.'); }
  const { codes, hashes } = generateRecoveryCodes();
  db.prepare("UPDATE users SET totp_secret=totp_pending, totp_pending='', totp_enabled=1, totp_last_step=?, recovery_codes=?, updated_at=? WHERE id=?").run(step, JSON.stringify(hashes), new Date().toISOString(), id);
  recordSecurityEvent('two_factor_enabled', actor, { id, name: row.username });
  return { codes, user: getUser(id)! };
}
/** Valida un código de la aplicación o de recuperación (que se consume). */
export function verifySecondFactor(id: string, code: unknown): { ok: false } | { ok: true; method: 'totp' | 'recovery'; recoveryCodesLeft: number } {
  const row = userRow(id); if (!row || !row.totp_enabled) return { ok: false };
  const step = verifyTotp(row.totp_secret, code, row.totp_last_step);
  if (step) { db.prepare('UPDATE users SET totp_last_step=? WHERE id=?').run(step, id); return { ok: true, method: 'totp', recoveryCodesLeft: recoveryHashes(row).length }; }
  const remaining = consumeRecoveryCode(recoveryHashes(row), code);
  if (remaining) { db.prepare('UPDATE users SET recovery_codes=? WHERE id=?').run(JSON.stringify(remaining), id); return { ok: true, method: 'recovery', recoveryCodesLeft: remaining.length }; }
  return { ok: false };
}
export async function disableTwoFactor(id: string, input: { password?: unknown; code?: unknown }, actor: ActorRef): Promise<WorkspaceUser> {
  const row = userRow(id); if (!row || !row.active) throw new Error('Usuario no encontrado.');
  if (!row.totp_enabled) throw new Error('La verificación en dos pasos no está activada.');
  if (typeof input.password !== 'string' || !(await verifyPassword(input.password, row.password_hash))) { recordSecurityEvent('two_factor_failed', actor, { id, name: row.username }, { stage: 'disable', reason: 'password' }); throw new Error('La contraseña no es correcta.'); }
  if (!verifySecondFactor(id, input.code).ok) { recordSecurityEvent('two_factor_failed', actor, { id, name: row.username }, { stage: 'disable', reason: 'code' }); throw new Error('El código de verificación no es correcto.'); }
  db.prepare("UPDATE users SET totp_secret='', totp_pending='', totp_enabled=0, totp_last_step=0, recovery_codes='[]', updated_at=? WHERE id=?").run(new Date().toISOString(), id);
  recordSecurityEvent('two_factor_disabled', actor, { id, name: row.username });
  return getUser(id)!;
}
export function regenerateRecoveryCodes(id: string, code: unknown, actor: ActorRef): string[] {
  const row = userRow(id); if (!row || !row.totp_enabled) throw new Error('La verificación en dos pasos no está activada.');
  const step = verifyTotp(row.totp_secret, code, row.totp_last_step);
  if (!step) { recordSecurityEvent('two_factor_failed', actor, { id, name: row.username }, { stage: 'recovery_codes' }); throw new Error('Introduce un código actual de tu aplicación de autenticación.'); }
  const { codes, hashes } = generateRecoveryCodes();
  db.prepare('UPDATE users SET recovery_codes=?, totp_last_step=? WHERE id=?').run(JSON.stringify(hashes), step, id);
  recordSecurityEvent('recovery_codes_regenerated', actor, { id, name: row.username });
  return codes;
}
export function deleteSession(token: string) { if (token) db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(tokenDigest(token)); }
export function revokeUserSessions(userId: string, actor: ActorRef): number {
  const user = getUser(userId); if (!user) throw new Error('Usuario no encontrado.');
  const result = db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(userId);
  recordSecurityEvent('sessions_revoked', actor, { id: userId, name: user.username }, { count: Number(result.changes) });
  return Number(result.changes);
}

/**
 * Migración desde la contraseña compartida (APP_PASSWORD): si no existe ninguna cuenta,
 * crea un administrador con esa contraseña. Después, APP_PASSWORD deja de usarse.
 */
export function bootstrapAdminFromPassword(sharedPassword: string, name = 'admin'): WorkspaceUser | null {
  if (!sharedPassword || hasUsers()) return null;
  const data = validate(createUserSchema, { username: name, displayName: 'Administrador', role: 'admin', password: sharedPassword, mustChangePassword: false });
  const user = insertUser(data, hashPasswordSync(data.password), { id: '', name: 'Arranque del servidor' });
  recordSecurityEvent('bootstrap_admin', { id: '', name: 'Arranque del servidor' }, { id: user.id, name: user.username }, { source: 'APP_PASSWORD' });
  return user;
}
