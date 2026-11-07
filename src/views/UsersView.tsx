import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, LoaderCircle, LockKeyhole, LogOut, Pencil, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, UserPlus, Users, Wand2, X } from 'lucide-react';
import BackupsPanel from '../components/BackupsPanel';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { useAuth, PasswordFields, passwordProblem } from '../components/AuthGate';
import { EmptyState, ErrorMessage, Field, Modal, PageHeader, SaveButton } from '../components/UI';
import { initials } from '../lib/format';
import { PASSWORD_MIN_LENGTH, PERMISSIONS, PERMISSION_LABELS, ROLE_INFO, ROLE_PERMISSIONS, USER_ROLES, type SecurityEvent, type UserRole, type WorkspaceUser } from '../../shared/permissions';

type ListedUser = WorkspaceUser & { activeSessions: number };
type FormState = { id: string; username: string; displayName: string; role: UserRole; active: boolean; password: string; mustChangePassword: boolean; twoFactorEnabled: boolean };

const eventLabels: Record<string, string> = {
  login_succeeded: 'Inicio de sesión', login_failed: 'Intento de acceso fallido', logout: 'Cierre de sesión', user_created: 'Cuenta creada', user_updated: 'Datos de la cuenta actualizados',
  role_changed: 'Cambio de rol', user_deactivated: 'Cuenta desactivada', user_reactivated: 'Cuenta reactivada', password_reset: 'Contraseña temporal asignada', password_changed: 'Contraseña cambiada por su titular',
  password_change_failed: 'Cambio de contraseña rechazado', sessions_revoked: 'Sesiones cerradas', bootstrap_admin: 'Administrador inicial (APP_PASSWORD)', setup_admin: 'Control de acceso activado',
  login_locked: 'Acceso bloqueado temporalmente', two_factor_enabled: 'Verificación en dos pasos activada', two_factor_disabled: 'Verificación en dos pasos desactivada', two_factor_reset: 'Verificación en dos pasos restablecida',
  two_factor_failed: 'Código de verificación rechazado', recovery_code_used: 'Acceso con código de recuperación', recovery_codes_regenerated: 'Códigos de recuperación renovados', session_expired: 'Sesión caducada',
  own_sessions_revoked: 'Sesiones cerradas por su titular', backup_created: 'Copia de seguridad creada', backup_downloaded: 'Copia de seguridad descargada',
};
const WARNING_EVENTS = new Set(['login_failed', 'password_change_failed', 'login_locked', 'two_factor_failed', 'two_factor_reset', 'two_factor_disabled', 'recovery_code_used']);
const twoFactorStages: Record<string, string> = { login: 'al iniciar sesión', activation: 'al activarla', disable: 'al desactivarla', recovery_codes: 'al renovar códigos' };
const failureReasons: Record<string, string> = { password: 'contraseña incorrecta', unknown_user: 'usuario inexistente', inactive: 'cuenta desactivada' };
const DAY = 86_400_000;
const dateTime = (value: string) => value ? new Date(value).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca';
const relative = (value: string) => {
  if (!value) return 'Nunca'; const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Hace un momento'; if (minutes < 60) return `Hace ${minutes} min`; const hours = Math.round(minutes / 60); if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24); return days < 30 ? `Hace ${days} d` : dateTime(value);
};
export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
}
export function RoleBadge({ role }: { role: UserRole }) { return <span className={`role-badge ${role}`}>{ROLE_INFO[role].label}</span>; }

export default function UsersView() {
  const auth = useAuth();
  if (!auth.can('users.manage')) return auth.setupAvailable ? <SetupAccess /> : <><PageHeader eyebrow="EQUIPO Y ACCESO" title="Usuarios y acceso" /><div className="panel"><EmptyState icon={LockKeyhole} title={auth.protected ? 'Solo para administradores' : 'Cuentas no disponibles en esta demostración'} description={auth.protected ? 'Pide a un administrador del espacio que gestione las cuentas y los roles del equipo.' : 'Este servidor funciona como demostración pública sin cuentas. Para activar usuarios, configura el hash inicial y reinicia el servidor.'} /></div><RoleMatrix /></>;
  return <ManageUsers />;
}

function SetupAccess() {
  const auth = useAuth(); const { notify } = useApp();
  const [form, setForm] = useState({ displayName: '', username: '', next: '', confirm: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); const problem = passwordProblem(form); if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { const session = await api.setupFirstAdmin({ displayName: form.displayName, username: form.username, password: form.next }); auth.applySession(session); notify('Control de acceso activado. Ya eres administrador del espacio.'); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return <><PageHeader eyebrow="EQUIPO Y ACCESO" title="Activa el control de acceso" description="Ahora mismo cualquiera que abra esta dirección puede trabajar en el espacio. Crea tu cuenta de administrador para que cada persona entre con su propio usuario y rol." />
    <div className="users-setup"><form className="panel users-setup-form" onSubmit={submit}><span className="section-icon" style={{ marginBottom: 14 }}><ShieldCheck size={20} /></span><h2>Primer administrador</h2><p className="subtle">Al guardar, el espacio quedará protegido y se iniciará tu sesión. Después podrás invitar al resto del equipo.</p>
      <div className="form-grid" style={{ marginTop: 18 }}><Field label="Nombre y apellidos" required><input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required maxLength={120} autoComplete="name" /></Field><Field label="Usuario" required hint="Minúsculas, números, punto o guion. Ej.: ana.perez"><input value={form.username} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase() })} required maxLength={40} pattern="[a-z0-9][a-z0-9._\-]{2,39}" autoCapitalize="none" spellCheck={false} autoComplete="username" /></Field></div>
      <div className="form-grid"><PasswordFields value={form} onChange={v => setForm({ ...form, ...v })} /></div>
      <div className="alert alert-warning" style={{ marginTop: 14 }}><ShieldAlert size={18} /><p>Guarda esta contraseña en un gestor seguro. Si la pierdes, recupérala desde la consola del servidor con <code>npm run user:reset-password -- {form.username || 'usuario'}</code>.</p></div>
      <ErrorMessage error={error} /><div className="modal-actions"><SaveButton busy={busy} label="Crear cuenta y proteger el espacio" /></div></form>
      <RoleMatrix /></div></>;
}

function ManageUsers() {
  const auth = useAuth(); const { notify } = useApp();
  const [users, setUsers] = useState<ListedUser[] | null>(null); const [events, setEvents] = useState<SecurityEvent[]>([]); const [error, setError] = useState('');
  const [form, setForm] = useState<FormState | null>(null); const [busy, setBusy] = useState(false); const [formError, setFormError] = useState(''); const [created, setCreated] = useState<{ user: WorkspaceUser; password: string } | null>(null);
  const load = useCallback(async () => { try { const [list, log] = await Promise.all([api.listUsers(), api.listSecurityEvents(60)]); setUsers(list); setEvents(log); setError(''); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const open = (user?: ListedUser) => { setFormError(''); setConfirmReset(false); setForm(user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role, active: user.active, password: '', mustChangePassword: true, twoFactorEnabled: user.twoFactorEnabled } : { id: '', username: '', displayName: '', role: 'tecnico', active: true, password: generatePassword(), mustChangePassword: true, twoFactorEnabled: false }); };
  const [confirmReset, setConfirmReset] = useState(false);
  const resetTwoFactor = async () => {
    if (!form) return; setBusy(true); setFormError('');
    try { await api.updateUser(form.id, { resetTwoFactor: true }); notify(`Verificación en dos pasos de ${form.displayName} restablecida. Deberá activarla de nuevo.`); setForm({ ...form, twoFactorEnabled: false }); setConfirmReset(false); await load(); }
    catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  };
  const self = form?.id === auth.user?.id;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form) return; setBusy(true); setFormError('');
    try {
      if (form.id) {
        const original = users?.find(u => u.id === form.id);
        await api.updateUser(form.id, { displayName: form.displayName, ...(self ? {} : { role: form.role, active: form.active }), ...(form.password ? { password: form.password, mustChangePassword: form.mustChangePassword } : {}) });
        notify(form.password ? `Contraseña temporal asignada a ${form.displayName}. Sus sesiones abiertas se cerraron.` : original && original.active && !form.active ? `${form.displayName} ya no puede acceder.` : 'Cuenta actualizada.');
        if (form.password) setCreated({ user: { ...original!, displayName: form.displayName, mustChangePassword: form.mustChangePassword }, password: form.password });
      } else {
        const user = await api.createUser({ username: form.username, displayName: form.displayName, role: form.role, password: form.password, mustChangePassword: form.mustChangePassword });
        setCreated({ user, password: form.password }); notify(`Bienvenida al equipo, ${user.displayName}.`);
      }
      setForm(null); await load();
    } catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  };
  const revoke = async (user: ListedUser) => { try { const result = await api.revokeUserSessions(user.id); notify(result.revoked ? `Se cerraron ${result.revoked} sesiones de ${user.displayName}.` : `${user.displayName} no tenía sesiones abiertas.`); if (user.id === auth.user?.id) { window.dispatchEvent(new Event('session-expired')); return; } await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  const active = users?.filter(u => u.active) || [];
  return <><PageHeader eyebrow="EQUIPO Y ACCESO" title="Usuarios y acceso" description="Cada persona entra con su propia cuenta. Los roles definen qué puede ver y hacer; el servidor los aplica en cada operación." actions={<button className="btn btn-primary" onClick={() => open()}><UserPlus size={16} />Nuevo usuario</button>} />
    <ErrorMessage error={error} />
    <div className="users-stats"><div className="panel users-stat"><Users size={17} /><div><strong>{active.length}</strong><span>cuentas activas</span></div></div><div className="panel users-stat"><ShieldCheck size={17} /><div><strong>{active.filter(u => u.role === 'admin').length}</strong><span>administradores</span></div></div><div className="panel users-stat"><Smartphone size={17} /><div><strong>{active.filter(u => u.twoFactorEnabled).length}<small> / {active.length}</small></strong><span>con verificación en dos pasos</span></div></div><div className="panel users-stat"><ShieldAlert size={17} /><div><strong>{events.filter(e => (e.type === 'login_failed' || e.type === 'two_factor_failed') && Date.now() - new Date(e.occurredAt).getTime() < DAY).length}</strong><span>accesos fallidos (24 h){events.some(e => e.type === 'login_locked' && Date.now() - new Date(e.occurredAt).getTime() < DAY) ? ' · con bloqueos' : ''}</span></div></div></div>
    <section className="panel"><div className="panel-header"><div><h2>Equipo</h2><p>Las cuentas no se eliminan: se desactivan para conservar quién hizo cada cambio.</p></div><button className="icon-btn" aria-label="Actualizar listado" title="Actualizar" onClick={load}><RefreshCw size={14} /></button></div>
      {!users ? <div className="audit-loading"><LoaderCircle className="spin" size={18} />Cargando cuentas…</div> : <div className="invoice-table-wrap"><table className="invoice-table users-table"><thead><tr><th>Persona</th><th>Rol</th><th className="hide-mobile">Estado</th><th className="hide-mobile">Último acceso</th><th className="hide-mobile">Sesiones</th><th aria-label="Acciones" /></tr></thead><tbody>{users.map(user => <tr key={user.id} className={user.active ? '' : 'inactive'}>
        <td><div className="invoice-client"><span className={`client-avatar tone-${USER_ROLES.indexOf(user.role) % 3}`}>{initials(user.displayName)}</span><div className="client-cell-text"><strong>{user.displayName}{user.id === auth.user?.id && <span className="you-tag">Tú</span>}</strong><span className="user-handle">@{user.username}</span></div></div></td>
        <td><RoleBadge role={user.role} /></td>
        <td className="hide-mobile">{!user.active ? <span className="status-badge anulada"><span className="status-dot" />Desactivada</span> : user.mustChangePassword ? <span className="status-badge emitida"><span className="status-dot" />Contraseña temporal</span> : <span className="status-badge pagada"><span className="status-dot" />Activa</span>}{user.active && user.twoFactorEnabled && <span className="twofa-badge" title="Verificación en dos pasos activada"><ShieldCheck size={11} />2FA</span>}</td>
        <td className="hide-mobile" title={dateTime(user.lastLoginAt)}>{relative(user.lastLoginAt)}</td><td className="hide-mobile">{user.activeSessions}</td>
        <td><div className="table-actions"><button className="icon-btn" aria-label={`Editar ${user.username}`} title="Editar cuenta" onClick={() => open(user)}><Pencil size={14} /></button><button className="icon-btn" aria-label={`Cerrar sesiones de ${user.username}`} title="Cerrar todas sus sesiones" disabled={!user.activeSessions} onClick={() => revoke(user)}><LogOut size={14} /></button></div></td>
      </tr>)}</tbody></table></div>}
    </section>
    <div className="users-columns"><RoleMatrix /><section className="panel"><div className="panel-header"><div><h2>Actividad de acceso</h2><p>Últimos 60 eventos de seguridad. Nunca se registran contraseñas.</p></div></div><ol className="audit-events security-events">{events.map(event => <li key={event.id} className={WARNING_EVENTS.has(event.type) ? 'warning' : ''}><div><strong>{eventLabels[event.type] || event.type}</strong><time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time></div><p>{describeEvent(event)}</p></li>)}{!events.length && <li><p>Sin eventos registrados.</p></li>}</ol></section></div>
    <BackupsPanel onChanged={load} />
    {form && <Modal title={form.id ? `Cuenta de ${form.displayName || form.username}` : 'Invita a una persona al equipo'} subtitle={form.id ? `@${form.username}` : 'Comparte el usuario y la contraseña temporal por un canal seguro, nunca en el mismo mensaje.'} onClose={() => { if (!busy) setForm(null); }} wide><form onSubmit={save}>
      <div className="form-grid"><Field label="Nombre y apellidos" required><input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required maxLength={120} /></Field><Field label="Usuario" required hint={form.id ? 'El usuario no cambia: identifica a la persona en el registro de actividad.' : 'Minúsculas, números, punto o guion. Ej.: ana.perez'}><input value={form.username} disabled={!!form.id} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase() })} required maxLength={40} pattern="[a-z0-9][a-z0-9._\-]{2,39}" autoCapitalize="none" spellCheck={false} /></Field></div>
      <h3 className="modal-section-title">Rol</h3>{self && <p className="field-hint" style={{ marginBottom: 8 }}>No puedes cambiar tu propio rol ni desactivar tu cuenta. Pide a otro administrador que lo haga.</p>}
      <div className="role-options" role="radiogroup" aria-label="Rol">{USER_ROLES.map(role => <label key={role} className={`role-option ${form.role === role ? 'selected' : ''} ${self ? 'disabled' : ''}`}><input type="radio" name="role" value={role} checked={form.role === role} disabled={self} onChange={() => setForm({ ...form, role })} /><span><strong>{ROLE_INFO[role].label}</strong>{ROLE_INFO[role].description}</span></label>)}</div>
      {form.id && !self && <label className="check-row"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /><span><strong>Cuenta activa</strong>Al desactivarla se cierran sus sesiones y no podrá entrar. Sus registros se conservan.</span></label>}
      {form.id && !self && form.twoFactorEnabled && <><h3 className="modal-section-title">Verificación en dos pasos</h3><div className="twofa-admin"><p><ShieldCheck size={14} />Activada. Si perdió el teléfono y sus códigos de recuperación, restablécela: se cerrarán sus sesiones y podrá entrar solo con su contraseña hasta activarla de nuevo.</p>
        {confirmReset ? <div className="twofa-admin-confirm"><span>¿Confirmas que verificaste la identidad de {form.displayName}?</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)} disabled={busy}>Cancelar</button><button type="button" className="btn btn-danger btn-sm" onClick={resetTwoFactor} disabled={busy}>Sí, restablecer</button></div>
          : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmReset(true)}><Smartphone size={13} />Restablecer verificación en dos pasos</button>}</div></>}
      <h3 className="modal-section-title">{form.id ? 'Restablecer contraseña' : 'Acceso inicial'}</h3>{self ? <p className="field-hint">Cambia tu propia contraseña desde «Mi cuenta», que solicita la contraseña actual.</p> : <>
        <div className="password-generator"><Field label={form.id ? 'Nueva contraseña temporal (opcional)' : 'Contraseña temporal'} required={!form.id} hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Al asignarla se cierran sus sesiones abiertas.`}><input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} minLength={form.password || !form.id ? PASSWORD_MIN_LENGTH : undefined} maxLength={1024} required={!form.id} autoComplete="new-password" spellCheck={false} className="mono" /></Field><button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, password: generatePassword() })}><Wand2 size={13} />Generar</button>{form.id && form.password && <button type="button" className="icon-btn" aria-label="No cambiar la contraseña" title="No cambiar la contraseña" onClick={() => setForm({ ...form, password: '' })}><X size={14} /></button>}</div>
        {(!form.id || form.password) && <label className="check-row"><input type="checkbox" checked={form.mustChangePassword} onChange={e => setForm({ ...form, mustChangePassword: e.target.checked })} /><span><strong>Exigir cambio en el primer acceso</strong>Recomendado: solo esa persona conocerá su contraseña definitiva.</span></label>}</>}
      <ErrorMessage error={formError} /><div className="modal-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>Cancelar</button><SaveButton busy={busy} label={form.id ? 'Guardar cuenta' : 'Crear cuenta'} /></div></form></Modal>}
    {created && <CredentialsDialog {...created} onClose={() => setCreated(null)} />}
  </>;
}

function describeEvent(event: SecurityEvent) {
  const target = event.targetName ? `@${event.targetName}` : ''; const by = event.actorName ? ` · por ${event.actorName}` : ''; const ip = event.ip ? ` · peer ${event.ip}` : '';
  const d = event.details as Record<string, string | number | boolean>;
  if (event.type === 'login_failed') return `${target || 'Usuario vacío'} · ${failureReasons[String(d.reason)] || 'rechazado'}${ip}`;
  if (event.type === 'role_changed') return `${target}: ${ROLE_INFO[d.previous as UserRole]?.label || d.previous} → ${ROLE_INFO[d.role as UserRole]?.label || d.role}${by}`;
  if (event.type === 'user_created') return `${target} · ${ROLE_INFO[d.role as UserRole]?.label || d.role}${by}`;
  if (event.type === 'sessions_revoked') return `${target} · ${d.count} sesiones${by}`;
  if (event.type === 'login_succeeded') return `${target}${d.secondFactor === 'recovery' ? ' · con código de recuperación' : d.secondFactor === 'totp' ? ' · con verificación en dos pasos' : ''}${ip}`;
  if (event.type === 'logout') return `${target}${ip}`;
  if (event.type === 'login_locked') return `${target || 'Usuario vacío'} · ${d.minutes} min tras varios intentos fallidos${ip}`;
  if (event.type === 'two_factor_failed') return `${target} · ${twoFactorStages[String(d.stage)] || 'código incorrecto'}${ip}`;
  if (event.type === 'recovery_code_used') return `${target} · quedan ${d.remaining} códigos${ip}`;
  if (event.type === 'session_expired') return `${target} · ${d.reason === 'idle' ? 'por inactividad' : 'duración máxima alcanzada'}`;
  if (event.type === 'own_sessions_revoked') return `${target} · ${d.count} ${Number(d.count) === 1 ? 'sesión' : 'sesiones'}${ip}`;
  if (event.type === 'backup_created') return `${event.targetName} · cifrada${by}`;
  if (event.type === 'backup_downloaded') return `${event.targetName}${by}${ip}`;
  return `${target}${by}`;
}

function CredentialsDialog({ user, password, onClose }: { user: WorkspaceUser; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Usuario: ${user.username}\nContraseña temporal: ${password}`;
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return <Modal title="Credenciales listas para entregar" subtitle={`${user.displayName} · se muestran una sola vez`} onClose={onClose}><div className="credentials-card"><div><span>Usuario</span><code>{user.username}</code></div><div><span>Contraseña temporal</span><code>{password}</code></div></div><div className="alert alert-warning"><KeyRound size={18} /><p>Entrégala en persona o por un canal cifrado. Nexo no la vuelve a mostrar ni la envía por correo. {user.mustChangePassword ? 'Deberá elegir una contraseña propia al entrar.' : ''}</p></div><div className="modal-actions"><button className="btn btn-secondary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copiado' : 'Copiar'}</button><button className="btn btn-primary" onClick={onClose}>Hecho</button></div></Modal>;
}

export function RoleMatrix() {
  return <section className="panel"><div className="panel-header"><div><h2>Qué puede hacer cada rol</h2><p>Todos los roles consultan y descargan documentos.</p></div></div><div className="invoice-table-wrap"><table className="invoice-table role-matrix"><thead><tr><th>Permiso</th>{USER_ROLES.map(role => <th key={role} title={ROLE_INFO[role].label}>{ROLE_INFO[role].short}</th>)}</tr></thead><tbody>{PERMISSIONS.map(permission => <tr key={permission}><td>{PERMISSION_LABELS[permission]}</td>{USER_ROLES.map(role => <td key={role} aria-label={`${ROLE_INFO[role].label}: ${ROLE_PERMISSIONS[role].includes(permission) ? 'sí' : 'no'}`}>{ROLE_PERMISSIONS[role].includes(permission) ? <Check size={14} className="matrix-yes" /> : <span className="matrix-no">—</span>}</td>)}</tr>)}</tbody></table></div></section>;
}
