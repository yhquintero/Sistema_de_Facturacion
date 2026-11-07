import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, KeyRound, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { ErrorMessage, Field } from './UI';
import { PASSWORD_MIN_LENGTH, ROLE_INFO, type Permission, type SessionInfo, type SessionUser } from '../../shared/permissions';

type AuthValue = {
  protected: boolean; demo: boolean; user: SessionUser | null; permissions: Permission[]; setupAvailable: boolean;
  can: (permission: Permission) => boolean; logout: () => Promise<void>; refreshSession: () => Promise<void>; applySession: (session: SessionInfo) => void;
};
const AuthContext = createContext<AuthValue>({ protected: false, demo: false, user: null, permissions: [], setupAvailable: false, can: () => false, logout: async () => {}, refreshSession: async () => {}, applySession: () => {} });
export function useAuth() { return useContext(AuthContext); }

async function postJson<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data as T;
}
const signedOut = (s: SessionInfo | null): SessionInfo => ({ protected: true, authenticated: false, demo: s?.demo ?? false, user: null, permissions: [], setupAvailable: false });

function Brand() { return <a href="#/" className="brand" style={{ padding: 0, marginBottom: 36 }}><div className="brand-symbol"><span /><span /><span /></div><span className="brand-word">nexo<b>.</b></span></a>; }

export function PasswordFields({ value, onChange, autoFocus }: { value: { next: string; confirm: string }; onChange: (value: { next: string; confirm: string }) => void; autoFocus?: boolean }) {
  return <><Field label="Nueva contraseña" required hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Una frase larga es más segura y fácil de recordar.`}><input type="password" autoComplete="new-password" value={value.next} onChange={e => onChange({ ...value, next: e.target.value })} minLength={PASSWORD_MIN_LENGTH} maxLength={256} required autoFocus={autoFocus} /></Field>
    <Field label="Repite la nueva contraseña" required><input type="password" autoComplete="new-password" value={value.confirm} onChange={e => onChange({ ...value, confirm: e.target.value })} minLength={PASSWORD_MIN_LENGTH} maxLength={256} required /></Field></>;
}
export function passwordProblem(value: { next: string; confirm: string }) {
  if (value.next.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (value.next !== value.confirm) return 'Las contraseñas no coinciden.';
  return '';
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null); const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({ username: '', password: '' }); const [busy, setBusy] = useState(false);
  const [change, setChange] = useState({ current: '', next: '', confirm: '' });
  const check = useCallback(async () => { try { const response = await fetch('/api/session', { cache: 'no-store' }); if (!response.ok) throw new Error('No se pudo conectar al servidor.'); setSession(await response.json()); setError(''); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => {
    void check();
    const expired = () => setSession(s => signedOut(s));
    const recheck = () => { void check(); };
    window.addEventListener('session-expired', expired); window.addEventListener('session-changed', recheck);
    return () => { window.removeEventListener('session-expired', expired); window.removeEventListener('session-changed', recheck); };
  }, [check]);
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const next = await postJson<SessionInfo>('/api/login', credentials); setCredentials({ username: credentials.username, password: '' }); setSession(next); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const logout = useCallback(async () => { try { await fetch('/api/logout', { method: 'POST' }); } finally { if (window.location.hash && window.location.hash !== '#/') window.location.hash = '/'; setSession(s => signedOut(s)); setChange({ current: '', next: '', confirm: '' }); } }, []);
  const forcedChange = async (event: React.FormEvent) => {
    event.preventDefault(); const problem = passwordProblem(change); if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { setSession(await postJson<SessionInfo>('/api/me/password', { currentPassword: change.current, newPassword: change.next }, 'PUT')); setChange({ current: '', next: '', confirm: '' }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!session) return <div className="boot-screen"><LoaderCircle size={23} className="spin" /><p>{error || 'Conectando con tu espacio de trabajo…'}</p>{error && <button className="btn btn-primary" onClick={check}>Volver a intentar</button>}</div>;

  if (session.authenticated && session.user?.mustChangePassword) return <div className="login-page"><div className="login-card"><Brand /><span className="section-icon" style={{ marginBottom: 18 }}><KeyRound size={21} /></span><h1>Elige tu propia contraseña.</h1><p>Hola, {session.user.displayName}. Un administrador te asignó una contraseña temporal. Sustitúyela para empezar a trabajar como <strong>{ROLE_INFO[session.user.role].label}</strong>.</p>
    <form onSubmit={forcedChange}><Field label="Contraseña temporal" required><input type="password" autoComplete="current-password" value={change.current} onChange={e => setChange({ ...change, current: e.target.value })} required maxLength={256} autoFocus /></Field><PasswordFields value={change} onChange={v => setChange({ ...change, ...v })} /><ErrorMessage error={error} /><button className="btn btn-primary w-full" disabled={busy} type="submit" style={{ marginTop: 20 }}>{busy ? <LoaderCircle size={17} className="spin" /> : <>Guardar y continuar<ArrowRight size={16} /></>}</button></form>
    <button className="btn btn-ghost w-full" style={{ marginTop: 10 }} onClick={logout}><LogOut size={15} />Cerrar sesión</button></div></div>;

  if (session.authenticated) {
    const value: AuthValue = { protected: session.protected, demo: session.demo, user: session.user, permissions: session.permissions, setupAvailable: session.setupAvailable, can: p => session.permissions.includes(p), logout, refreshSession: check, applySession: setSession };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  return <div className="login-page"><div className="login-card"><Brand /><span className="section-icon" style={{ marginBottom: 18 }}><LockKeyhole size={21} /></span><h1>Bienvenido de nuevo.</h1><p>Accede con tu usuario personal. Cada persona del equipo ve y hace solo lo que su rol permite.</p>
    <form onSubmit={login}><Field label="Usuario" required><input autoComplete="username" autoCapitalize="none" spellCheck={false} value={credentials.username} onChange={e => setCredentials({ ...credentials, username: e.target.value })} placeholder="tu.usuario" required maxLength={80} autoFocus /></Field>
      <Field label="Contraseña" required><input type="password" autoComplete="current-password" value={credentials.password} onChange={e => setCredentials({ ...credentials, password: e.target.value })} required maxLength={1024} /></Field>
      <ErrorMessage error={error} /><button className="btn btn-primary w-full" disabled={busy} type="submit" style={{ marginTop: 20 }}>{busy ? <LoaderCircle size={17} className="spin" /> : <>Entrar a mi espacio<ArrowRight size={16} /></>}</button></form>
    <div className="login-note"><ShieldCheck size={14} />Acceso privado · Sesión de 8 horas</div><p className="signature-disclaimer">¿Olvidaste tu contraseña? Pide a un administrador del espacio que te asigne una temporal.</p></div><div className="login-tagline">Cada servicio. Cada entrega. Todo en orden.</div></div>;
}
