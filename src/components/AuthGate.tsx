import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Clock, KeyRound, LoaderCircle, LockKeyhole, LogOut, ShieldCheck, Smartphone, X } from 'lucide-react';
import PrivacyNotice from './PrivacyNotice';
import { csrfHeaders, setCsrfToken } from '../lib/security';
import { ErrorMessage, Field } from './UI';
import type { SessionExpiredDetail } from '../api';
import IdleWatcher from './IdleWatcher';
import TwoFactorPanel, { CodeInput } from './TwoFactorPanel';
import { PASSWORD_MIN_LENGTH, ROLE_INFO, type Permission, type SessionInfo, type SessionUser, type TwoFactorChallenge } from '../../shared/permissions';

type AuthValue = {
  protected: boolean; demo: boolean; user: SessionUser | null; permissions: Permission[]; setupAvailable: boolean;
  can: (permission: Permission) => boolean; logout: () => Promise<void>; refreshSession: () => Promise<void>; applySession: (session: SessionInfo) => void;
};
const AuthContext = createContext<AuthValue>({ protected: false, demo: false, user: null, permissions: [], setupAvailable: false, can: () => false, logout: async () => {}, refreshSession: async () => {}, applySession: () => {} });
export function useAuth() { return useContext(AuthContext); }

async function postJson<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...csrfHeaders() }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data as T;
}
const signedOut = (s: SessionInfo | null): SessionInfo => ({ protected: true, authenticated: false, demo: s?.demo ?? false, user: null, permissions: [], setupAvailable: false });

function Brand() { return <a href="#/" className="brand" style={{ padding: 0, marginBottom: 36 }}><div className="brand-symbol"><span /><span /><span /></div><span className="brand-word">nexo<b>.</b></span></a>; }

export function PasswordFields({ value, onChange, autoFocus }: { value: { next: string; confirm: string }; onChange: (value: { next: string; confirm: string }) => void; autoFocus?: boolean }) {
  return <><Field label="Nueva contraseña" required hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Una frase larga es más segura y fácil de recordar.`}><input type="password" autoComplete="new-password" value={value.next} onChange={e => onChange({ ...value, next: e.target.value })} minLength={PASSWORD_MIN_LENGTH} maxLength={1024} required autoFocus={autoFocus} /></Field>
    <Field label="Repite la nueva contraseña" required><input type="password" autoComplete="new-password" value={value.confirm} onChange={e => onChange({ ...value, confirm: e.target.value })} minLength={PASSWORD_MIN_LENGTH} maxLength={1024} required /></Field></>;
}
export function passwordProblem(value: { next: string; confirm: string }) {
  if (value.next.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (value.next !== value.confirm) return 'Las contraseñas no coinciden.';
  return '';
}

const IDLE_MESSAGE = 'Tu sesión se cerró por inactividad. Vuelve a iniciar sesión para continuar.';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null); const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({ username: '', password: '' }); const [busy, setBusy] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const applySession = useCallback((next: SessionInfo) => { setCsrfToken(next.csrfToken || ''); setSession(next); }, []);
  const [change, setChange] = useState({ current: '', next: '', confirm: '' });
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null); const [code, setCode] = useState(''); const [useRecovery, setUseRecovery] = useState(false);
  /** Aviso informativo en la pantalla de acceso (p. ej. sesión cerrada por inactividad). */
  const [signedOutNotice, setSignedOutNotice] = useState(''); const [notice, setNotice] = useState('');
  const check = useCallback(async () => { try { const response = await fetch('/api/session', { cache: 'no-store' }); if (!response.ok) throw new Error('No se pudo conectar al servidor.'); const info = await response.json() as SessionInfo; if (info.expiredReason === 'idle') setSignedOutNotice(IDLE_MESSAGE); applySession(info); setError(''); } catch (e) { setError((e as Error).message); } }, [applySession]);
  useEffect(() => {
    void check();
    const expired = (event: Event) => { const detail = (event as CustomEvent<SessionExpiredDetail>).detail; if (detail?.code === 'SESSION_IDLE') setSignedOutNotice(IDLE_MESSAGE); setCsrfToken(''); setSession(s => signedOut(s)); };
    const recheck = () => { void check(); };
    window.addEventListener('session-expired', expired); window.addEventListener('session-changed', recheck); window.addEventListener('pageshow', recheck);
    return () => { window.removeEventListener('session-expired', expired); window.removeEventListener('session-changed', recheck); window.removeEventListener('pageshow', recheck); };
  }, [check]);
  const enter = (next: SessionInfo & { recoveryCodesLeft?: number }) => {
    setCredentials(c => ({ username: c.username, password: '' })); setChallenge(null); setCode(''); setUseRecovery(false); setSignedOutNotice('');
    if (typeof next.recoveryCodesLeft === 'number') setNotice(`Entraste con un código de recuperación. Te quedan ${next.recoveryCodesLeft}. ${next.recoveryCodesLeft <= 3 ? 'Genera códigos nuevos desde «Mi cuenta».' : ''}`.trim());
    applySession(next);
  };
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const next = await postJson<SessionInfo | TwoFactorChallenge>('/api/login', credentials);
      if ('twoFactorRequired' in next) { setChallenge(next); setCode(''); setCredentials(c => ({ username: c.username, password: '' })); } else enter(next);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault(); if (!challenge) return; setBusy(true); setError('');
    try { enter(await postJson<SessionInfo & { recoveryCodesLeft?: number }>('/api/login/2fa', { challenge: challenge.challenge, code })); }
    catch (e) { const message = (e as Error).message; setError(message); setCode(''); if (/caduc|bloquead/i.test(message)) setChallenge(null); } finally { setBusy(false); }
  };
  const logout = useCallback(async () => { try { const response = await fetch('/api/logout', { method: 'POST', headers: csrfHeaders() }); if (!response.ok && response.status !== 401) throw new Error('No se pudo cerrar la sesión del servidor. Inténtalo de nuevo.'); setCsrfToken(''); if (window.location.hash && window.location.hash !== '#/') window.location.hash = '/'; setSession(s => signedOut(s)); setChange({ current: '', next: '', confirm: '' }); setNotice(''); } catch (e) { setError((e as Error).message); } }, []);
  const idleExpired = useCallback(() => { setSignedOutNotice(IDLE_MESSAGE); void logout(); }, [logout]);
  const forcedChange = async (event: React.FormEvent) => {
    event.preventDefault(); const problem = passwordProblem(change); if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { applySession(await postJson<SessionInfo>('/api/me/password', { currentPassword: change.current, newPassword: change.next }, 'PUT')); setChange({ current: '', next: '', confirm: '' }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!session) return <div className="boot-screen"><LoaderCircle size={23} className="spin" /><p>{error || 'Conectando con tu espacio de trabajo…'}</p>{error && <button className="btn btn-primary" onClick={check}>Volver a intentar</button>}</div>;

  if (session.authenticated && session.user?.mustChangePassword) return <div className="login-page"><div className="login-card"><Brand /><span className="section-icon" style={{ marginBottom: 18 }}><KeyRound size={21} /></span><h1>Elige tu propia contraseña.</h1><p>Hola, {session.user.displayName}. Un administrador te asignó una contraseña temporal. Sustitúyela para empezar a trabajar como <strong>{ROLE_INFO[session.user.role].label}</strong>.</p>
    <form onSubmit={forcedChange}><Field label="Contraseña temporal" required><input type="password" autoComplete="current-password" value={change.current} onChange={e => setChange({ ...change, current: e.target.value })} required maxLength={1024} autoFocus /></Field><PasswordFields value={change} onChange={v => setChange({ ...change, ...v })} /><ErrorMessage error={error} /><button className="btn btn-primary w-full" disabled={busy} type="submit" style={{ marginTop: 20 }}>{busy ? <LoaderCircle size={17} className="spin" /> : <>Guardar y continuar<ArrowRight size={16} /></>}</button></form>
    <button className="btn btn-ghost w-full" style={{ marginTop: 10 }} onClick={logout}><LogOut size={15} />Cerrar sesión</button></div></div>;

  if (session.authenticated && session.user && session.twoFactorSetupRequired) return <div className="login-page"><div className="login-card login-card-wide"><Brand /><span className="section-icon" style={{ marginBottom: 18 }}><Smartphone size={21} /></span><h1>Protege tu cuenta de administrador.</h1><p>Hola, {session.user.displayName}. La política de este espacio exige la verificación en dos pasos a los administradores. Actívala para continuar.</p>
    <TwoFactorPanel enabled={false} account={session.user.username} forced onSession={setSession} />
    <button className="btn btn-ghost w-full" style={{ marginTop: 10 }} onClick={logout}><LogOut size={15} />Cerrar sesión</button></div></div>;

  if (session.authenticated) {
    const value: AuthValue = { protected: session.protected, demo: session.demo, user: session.user, permissions: session.permissions, setupAvailable: session.setupAvailable, can: p => session.permissions.includes(p), logout, refreshSession: check, applySession };
    return <AuthContext.Provider value={value}>{error && <div className="offline-banner" role="alert">{error}</div>}{children}
      {session.user && (session.idleMinutes ?? 0) > 0 && <IdleWatcher onExpired={idleExpired} onLogout={logout} />}
      {notice && <div className="auth-notice" role="status"><KeyRound size={16} /><span>{notice}</span><button className="icon-btn" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}
    </AuthContext.Provider>;
  }

  if (challenge) return <div className="login-page"><div className="login-card"><Brand /><span className="section-icon" style={{ marginBottom: 18 }}><Smartphone size={21} /></span><h1>Verificación en dos pasos.</h1><p>Hola, {challenge.displayName}. {useRecovery ? 'Escribe uno de tus códigos de recuperación. Cada código sirve una sola vez.' : 'Abre tu aplicación de autenticación y escribe el código de 6 dígitos de Nexo.'}</p>
    <form onSubmit={verify}><CodeInput key={useRecovery ? 'recovery' : 'totp'} value={code} onChange={setCode} allowRecovery={useRecovery} autoFocus label={useRecovery ? 'Código de recuperación' : 'Código de verificación'} />
      <ErrorMessage error={error} /><button className="btn btn-primary w-full" disabled={busy || (!useRecovery && code.length !== 6)} type="submit" style={{ marginTop: 20 }}>{busy ? <LoaderCircle size={17} className="spin" /> : <>Verificar y entrar<ArrowRight size={16} /></>}</button></form>
    <button className="btn btn-ghost w-full" style={{ marginTop: 10 }} onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}><KeyRound size={15} />{useRecovery ? 'Usar el código de la aplicación' : '¿Sin teléfono? Usa un código de recuperación'}</button>
    <button className="btn btn-ghost w-full" onClick={() => { setChallenge(null); setCode(''); setError(''); }}><ArrowLeft size={15} />Volver</button>
    <p className="signature-disclaimer">¿Perdiste el teléfono y los códigos? Un administrador puede restablecer tu verificación en dos pasos.</p></div><div className="login-tagline">Cada servicio. Cada entrega. Todo en orden.</div></div>;

  return <div className="login-page"><div className="login-card"><Brand /><span className="section-icon" style={{ marginBottom: 18 }}><LockKeyhole size={21} /></span><h1>Bienvenido de nuevo.</h1><p>Accede con tu usuario personal. Cada persona del equipo ve y hace solo lo que su rol permite.</p>
    {signedOutNotice && <div className="alert alert-info login-alert" role="status"><Clock size={16} /><p>{signedOutNotice}</p></div>}
    <form onSubmit={login}><Field label="Usuario" required><input autoComplete="username" autoCapitalize="none" spellCheck={false} value={credentials.username} onChange={e => setCredentials({ ...credentials, username: e.target.value })} placeholder="tu.usuario" required maxLength={80} autoFocus /></Field>
      <Field label="Contraseña" required><input type="password" autoComplete="current-password" value={credentials.password} onChange={e => setCredentials({ ...credentials, password: e.target.value })} required maxLength={1024} /></Field>
      <ErrorMessage error={error} /><button className="btn btn-primary w-full" disabled={busy} type="submit" style={{ marginTop: 20 }}>{busy ? <LoaderCircle size={17} className="spin" /> : <>Entrar a mi espacio<ArrowRight size={16} /></>}</button></form>
    <div className="login-note"><ShieldCheck size={14} />Acceso privado · Bloqueo tras 5 intentos · Cierre por inactividad</div><p className="signature-disclaimer">¿Olvidaste tu contraseña? Pide a un administrador del espacio que te asigne una temporal.</p></div><button className="text-link" style={{marginTop:18}} onClick={()=>setPrivacy(true)}>Privacidad y tus datos</button>{privacy && <PrivacyNotice onClose={()=>setPrivacy(false)}/>}<div className="login-tagline">Cada servicio. Cada entrega. Todo en orden.</div></div>;
}
