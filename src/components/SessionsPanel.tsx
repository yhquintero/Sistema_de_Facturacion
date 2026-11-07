import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, LogOut, Monitor, Smartphone } from 'lucide-react';
import { api } from '../api';
import { ErrorMessage } from './UI';
import type { OwnSession } from '../../shared/permissions';

/** Nombre legible del navegador y sistema a partir del User-Agent (sin librerías externas). */
export function describeDevice(userAgent: string): { label: string; mobile: boolean } {
  const ua = userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ua ? 'Navegador' : 'Dispositivo desconocido';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: os ? `${browser} en ${os}` : browser, mobile: /Android|iPhone|iPad|iPod|Mobile/.test(ua) };
}
const when = (iso: string) => { const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000); if (minutes < 2) return 'activa ahora'; if (minutes < 60) return `hace ${minutes} min`; const hours = Math.round(minutes / 60); return hours < 24 ? `hace ${hours} h` : new Date(iso).toLocaleString('es'); };

export default function SessionsPanel({ onChanged }: { onChanged?: (message: string) => void }) {
  const [sessions, setSessions] = useState<OwnSession[] | null>(null); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const load = useCallback(() => api.listOwnSessions().then(setSessions).catch(e => setError((e as Error).message)), []);
  useEffect(() => { void load(); }, [load]);
  const revoke = async (id: string) => {
    setBusy(id); setError('');
    try { const { revoked } = await api.revokeOwnSession(id); onChanged?.(revoked === 1 ? 'Se cerró 1 sesión.' : `Se cerraron ${revoked} sesiones.`); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  if (!sessions) return <div className="sessions-loading"><LoaderCircle size={16} className="spin" />{error || 'Cargando sesiones…'}</div>;
  const others = sessions.filter(s => !s.current);
  return <div className="own-sessions">
    <ul>{sessions.map(s => { const device = describeDevice(s.userAgent); const Icon = device.mobile ? Smartphone : Monitor; return <li key={s.id} className={s.current ? 'current' : ''}>
      <Icon size={17} /><div><strong>{device.label}{s.current && <span className="session-current">Este dispositivo</span>}</strong><span>{s.ip || 'IP desconocida'} · {s.current ? 'activa ahora' : when(s.lastSeenAt)} · iniciada {new Date(s.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
      {!s.current && <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(s.id)} disabled={!!busy} aria-label={`Cerrar sesión en ${device.label}`}>{busy === s.id ? <LoaderCircle size={14} className="spin" /> : <LogOut size={14} />}Cerrar</button>}
    </li>; })}</ul>
    <ErrorMessage error={error} />
    {others.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => revoke('others')} disabled={!!busy}>{busy === 'others' ? <LoaderCircle size={15} className="spin" /> : <LogOut size={15} />}Cerrar las otras {others.length} sesiones</button>}
  </div>;
}
