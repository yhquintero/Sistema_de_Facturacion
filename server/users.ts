import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, scryptSync, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { validate } from './validation';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USER_ROLES, USERNAME_PATTERN, type SecurityEvent, type SessionUser, type UserRole, type WorkspaceUser } from '../shared/permissions';

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
`);

export const SESSION_TTL_MS = 8 * 60 * 60_000;
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
export const updateUserSchema = z.object({ displayName: displayName.optional(), role: role.optional(), active: z.boolean().optional(), password: password.optional(), mustChangePassword: z.boolean().optional() });
export const setupSchema = z.object({ username, displayName, password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1, 'Indica tu contraseña actual.').max(PASSWORD_MAX_LENGTH), newPassword: password });

type UserRow = { id: string; username: string; display_name: string; role: UserRole; password_hash: string; active: number; must_change_password: number; created_at: string; updated_at: string; last_login_at: string; password_changed_at: string };
const toWorkspaceUser = (row: UserRow): WorkspaceUser => ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role, mustChangePassword: !!row.must_change_password, active: !!row.active, createdAt: row.created_at, updatedAt: row.updated_at, lastLoginAt: row.last_login_at, passwordChangedAt: row.password_changed_at });
export const toSessionUser = (user: WorkspaceUser): SessionUser => ({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, mustChangePassword: user.mustChangePassword });
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
    if (!nextActive || passwordHash) db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const target = { id, name: current.username };
  if (nextRole !== current.role) recordSecurityEvent('role_changed', actor, target, { previous: current.role, role: nextRole });
  if (nextActive !== current.active) recordSecurityEvent(nextActive ? 'user_reactivated' : 'user_deactivated', actor, target);
  if (passwordHash) recordSecurityEvent('password_reset', actor, target, { mustChangePassword: mustChange });
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
  db.prepare('INSERT INTO user_sessions (token_hash,user_id,created_at,expires_at,ip,user_agent) VALUES (?,?,?,?,?,?)').run(tokenHash, userId, new Date(now).toISOString(), now + SESSION_TTL_MS, (meta.ip || '').slice(0, 64), (meta.userAgent || '').slice(0, 300));
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(new Date(now).toISOString(), userId);
  return { token, tokenHash };
}
export function resolveSession(token: string): { user: WorkspaceUser; tokenHash: string } | null {
  if (!token || token.length > 200) return null;
  const tokenHash = tokenDigest(token);
  const row = db.prepare('SELECT user_id, expires_at FROM user_sessions WHERE token_hash=?').get(tokenHash) as { user_id: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at <= Date.now()) { db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(tokenHash); return null; }
  const user = getUser(row.user_id);
  if (!user || !user.active) { db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(tokenHash); return null; }
  return { user, tokenHash };
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
