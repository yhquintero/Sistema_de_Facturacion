import { useState } from 'react';
import { Check, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { useAuth, PasswordFields, passwordProblem } from './AuthGate';
import { ErrorMessage, Field, Modal, SaveButton } from './UI';
import { initials } from '../lib/format';
import { PERMISSION_LABELS, ROLE_INFO } from '../../shared/permissions';

export default function AccountDialog({ onClose }: { onClose: () => void }) {
  const auth = useAuth(); const { notify, navigate } = useApp();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); const problem = passwordProblem(form); if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { auth.applySession(await api.changeOwnPassword(form.current, form.next)); setForm({ current: '', next: '', confirm: '' }); notify('Contraseña actualizada. Se cerraron tus otras sesiones.'); onClose(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  if (!auth.user) return <Modal title="Modo abierto, sin cuentas" subtitle="Cualquiera con la dirección del servidor puede trabajar en este espacio." onClose={onClose}>
    <div className="alert alert-warning"><ShieldCheck size={18} /><p>No hay usuarios ni roles activos. {auth.setupAvailable ? 'Crea el primer administrador para proteger el espacio y dar a cada persona su propio acceso.' : 'Esta demostración pública no admite cuentas.'}</p></div>
    <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Cerrar</button>{auth.setupAvailable && <button className="btn btn-primary" onClick={() => { onClose(); navigate('/users'); }}><ShieldCheck size={15} />Activar control de acceso</button>}</div></Modal>;
  const role = ROLE_INFO[auth.user.role];
  return <Modal title="Mi cuenta" subtitle="Tu identidad en este espacio de trabajo." onClose={onClose} wide>
    <div className="account-head"><span className="profile-avatar large">{initials(auth.user.displayName)}</span><div><h3>{auth.user.displayName}</h3><p>@{auth.user.username} · <span className={`role-badge ${auth.user.role}`}>{role.label}</span></p></div></div>
    <div className="account-grid"><div className="official-activity"><h3><UserRound size={13} style={{ display: 'inline', marginRight: 5 }} />Tu rol</h3><p>{role.description}</p><ul className="account-permissions">{auth.permissions.length ? auth.permissions.map(p => <li key={p}><Check size={12} />{PERMISSION_LABELS[p]}</li>) : <li><Check size={12} />Consultar y descargar documentos</li>}</ul></div>
      <form onSubmit={submit} className="account-password"><h3 className="modal-section-title" style={{ marginTop: 0 }}><KeyRound size={14} style={{ display: 'inline', marginRight: 6 }} />Cambiar contraseña</h3><Field label="Contraseña actual" required><input type="password" autoComplete="current-password" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} required maxLength={256} /></Field><PasswordFields value={form} onChange={v => setForm({ ...form, ...v })} /><ErrorMessage error={error} /><div className="modal-actions"><SaveButton busy={busy} label="Actualizar contraseña" /></div></form></div>
    <div className="modal-actions" style={{ justifyContent: 'space-between' }}><button className="btn btn-ghost" onClick={auth.logout}><LogOut size={15} />Cerrar sesión</button><button className="btn btn-secondary" onClick={onClose}>Cerrar</button></div>
  </Modal>;
}
