import { useEffect, useState } from 'react';
import { Check, Copy, Download, KeyRound, LoaderCircle, QrCode, RefreshCw, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { api } from '../api';
import { ErrorMessage, Field } from './UI';
import type { SessionInfo, TwoFactorSetup } from '../../shared/permissions';

/** Campo para un código de 6 dígitos de la aplicación de autenticación. */
export function CodeInput({ value, onChange, allowRecovery = false, autoFocus = false, label = 'Código de 6 dígitos' }: { value: string; onChange: (value: string) => void; allowRecovery?: boolean; autoFocus?: boolean; label?: string }) {
  return <Field label={label} required hint={allowRecovery ? 'También puedes usar un código de recuperación (XXXXX-XXXXX).' : undefined}>
    <input className="otp-input" value={value} onChange={e => onChange(allowRecovery ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode={allowRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} placeholder={allowRecovery ? '123456' : '000000'} required
      pattern={allowRecovery ? '(\\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})' : '\\d{6}'} maxLength={allowRecovery ? 11 : 6} data-autofocus={autoFocus ? 'true' : undefined} autoFocus={autoFocus} />
  </Field>;
}

/** Lista de códigos de recuperación que solo se muestra una vez. */
export function RecoveryCodes({ codes, account, onDone }: { codes: string[]; account: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false); const [saved, setSaved] = useState(false);
  const text = `Nexo · Códigos de recuperación de ${account}\nGenerados: ${new Date().toLocaleString('es')}\nCada código sirve una sola vez si pierdes el teléfono.\n\n${codes.join('\n')}\n`;
  const copy = async () => { try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); setSaved(true); } catch { setCopied(false); } };
  const download = () => { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `nexo-codigos-recuperacion-${account}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000); setSaved(true); };
  return <div className="recovery-box">
    <div className="alert alert-warning"><KeyRound size={18} /><p><strong>Guarda estos códigos ahora.</strong> Es la única vez que se muestran. Cada uno permite entrar una sola vez si pierdes el teléfono.</p></div>
    <ol className="recovery-codes" aria-label="Códigos de recuperación">{codes.map(code => <li key={code}><code>{code}</code></li>)}</ol>
    <div className="recovery-actions"><button type="button" className="btn btn-secondary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copiados' : 'Copiar'}</button><button type="button" className="btn btn-secondary" onClick={download}><Download size={15} />Descargar .txt</button>
      <button type="button" className="btn btn-primary" onClick={onDone} disabled={!saved} title={saved ? undefined : 'Copia o descarga los códigos para continuar'}><Check size={15} />Ya los guardé</button></div>
  </div>;
}

/**
 * Activación, desactivación y regeneración de la verificación en dos pasos de la propia cuenta.
 * `forced` se usa cuando la política exige activarla antes de continuar (sin opción de desactivar).
 */
export default function TwoFactorPanel({ enabled, account, forced = false, onSession }: { enabled: boolean; account: string; forced?: boolean; onSession: (session: SessionInfo) => void }) {
  const [mode, setMode] = useState<'idle' | 'setup' | 'codes' | 'disable' | 'regenerate'>('idle');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null); const [code, setCode] = useState(''); const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>([]); const [pendingSession, setPendingSession] = useState<SessionInfo | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [left, setLeft] = useState<number | null>(null);
  useEffect(() => { if (enabled) api.getOwnSecurity().then(s => setLeft(s.recoveryCodesLeft)).catch(() => setLeft(null)); }, [enabled, mode]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const reset = () => { setMode('idle'); setCode(''); setPassword(''); setError(''); setSetup(null); };
  const start = () => run(async () => { setSetup(await api.startTwoFactorSetup()); setMode('setup'); setCode(''); });

  if (mode === 'codes') return <RecoveryCodes codes={codes} account={account} onDone={() => { const next = pendingSession; reset(); setCodes([]); if (next) onSession(next); }} />;

  if (mode === 'setup' && setup) return <form className="twofa-setup" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await api.enableTwoFactor(code); setCodes(result.recoveryCodes); setPendingSession(result.session); setMode('codes'); }); }}>
    <ol className="twofa-steps">
      <li><Smartphone size={15} /><span>Abre tu aplicación de autenticación (Google Authenticator, Microsoft Authenticator, 1Password, Aegis…) y añade una cuenta nueva.</span></li>
      <li><QrCode size={15} /><span>Escanea este código QR o escribe la clave manualmente.</span></li>
    </ol>
    <div className="twofa-qr-row"><div className="twofa-qr" role="img" aria-label="Código QR para la aplicación de autenticación" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
      <div className="twofa-secret"><span>Clave manual</span><code>{setup.secret.match(/.{1,4}/g)?.join(' ')}</code><small>Tipo: basada en tiempo · 6 dígitos · 30 s</small></div></div>
    <CodeInput value={code} onChange={setCode} autoFocus label="Escribe el código que muestra la aplicación" />
    <ErrorMessage error={error} />
    <div className="modal-actions">{!forced && <button type="button" className="btn btn-ghost" onClick={reset}>Cancelar</button>}<button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}Activar verificación</button></div>
  </form>;

  if (mode === 'disable') return <form className="twofa-setup" onSubmit={e => { e.preventDefault(); void run(async () => { onSession(await api.disableTwoFactor(password, code)); reset(); }); }}>
    <p className="muted-copy">Para desactivarla confirma tu contraseña y un código actual (o uno de recuperación).</p>
    <Field label="Contraseña" required><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={256} data-autofocus="true" /></Field>
    <CodeInput value={code} onChange={setCode} allowRecovery />
    <ErrorMessage error={error} />
    <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={reset}>Cancelar</button><button type="submit" className="btn btn-danger" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <ShieldOff size={16} />}Desactivar</button></div>
  </form>;

  if (mode === 'regenerate') return <form className="twofa-setup" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await api.regenerateRecoveryCodes(code); setCodes(result.recoveryCodes); setPendingSession(null); setMode('codes'); }); }}>
    <p className="muted-copy">Se generarán 10 códigos nuevos y los anteriores dejarán de funcionar.</p>
    <CodeInput value={code} onChange={setCode} autoFocus label="Código actual de la aplicación" />
    <ErrorMessage error={error} />
    <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={reset}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}Generar códigos nuevos</button></div>
  </form>;

  return <div className="twofa-summary">
    <div className={`twofa-state ${enabled ? 'on' : 'off'}`}>{enabled ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}<div><strong>{enabled ? 'Verificación en dos pasos activada' : 'Verificación en dos pasos desactivada'}</strong>
      <span>{enabled ? `Al entrar se pide un código de tu teléfono.${left !== null ? ` Te quedan ${left} códigos de recuperación.` : ''}` : 'Añade un código de tu teléfono a la contraseña: aunque alguien la descubra, no podrá entrar.'}</span></div></div>
    {enabled && left !== null && left <= 3 && <div className="alert alert-warning"><KeyRound size={16} /><p>Te quedan pocos códigos de recuperación. Genera unos nuevos.</p></div>}
    <ErrorMessage error={error} />
    <div className="twofa-buttons">{enabled ? <><button type="button" className="btn btn-secondary" onClick={() => { setMode('regenerate'); setCode(''); }}><RefreshCw size={15} />Nuevos códigos de recuperación</button>{!forced && <button type="button" className="btn btn-ghost danger-text" onClick={() => { setMode('disable'); setCode(''); }}><ShieldOff size={15} />Desactivar</button>}</>
      : <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}Activar verificación en dos pasos</button>}</div>
  </div>;
}
