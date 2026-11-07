import { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, Download, LoaderCircle, Lock, LockOpen, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { ErrorMessage } from './UI';
import type { BackupStatus } from '../../shared/permissions';

const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const dateTime = (iso: string) => new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
const ageHours = (iso: string) => (Date.now() - Date.parse(iso)) / 3_600_000;

/** Panel de copias de seguridad para administradores (listar, crear y descargar). */
export default function BackupsPanel({ onChanged }: { onChanged?: () => void }) {
  const { notify } = useApp();
  const [status, setStatus] = useState<BackupStatus | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(() => api.getBackups().then(s => { setStatus(s); setError(''); }).catch(e => setError((e as Error).message)), []);
  useEffect(() => { void load(); }, [load]);
  const create = async () => {
    setBusy(true); setError('');
    try { const next = await api.createBackup(); setStatus(next); notify(next.backups[0]?.encrypted ? 'Copia cifrada creada.' : 'Copia creada (sin cifrar: configura BACKUP_KEY).'); onChanged?.(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const last = status?.backups[0];
  const health = !last ? 'none' : ageHours(last.createdAt) > 36 ? 'stale' : 'ok';
  return <section className="panel backups-panel" aria-labelledby="backups-title">
    <div className="panel-header"><div><h2 id="backups-title">Copias de seguridad</h2><p>Copia completa de la base, sin sesiones abiertas. {status ? `Se conservan las ${status.keep} más recientes.` : ''}</p></div>
      <div className="page-actions"><button className="icon-btn" aria-label="Actualizar copias" title="Actualizar" onClick={() => void load()}><RefreshCw size={14} /></button><button className="btn btn-primary btn-sm" onClick={create} disabled={busy || !status}>{busy ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />}Crear copia ahora</button></div></div>
    <ErrorMessage error={error} />
    {!status ? !error && <div className="audit-loading"><LoaderCircle className="spin" size={18} />Cargando copias…</div> : <>
      <div className="backup-facts">
        <div className={`backup-fact ${health}`}><DatabaseBackup size={16} /><div><strong>{last ? dateTime(last.createdAt) : 'Ninguna todavía'}</strong><span>{health === 'stale' ? 'Última copia hace más de 36 h' : 'Última copia'}</span></div></div>
        <div className={`backup-fact ${status.encrypted ? 'ok' : 'warn'}`}>{status.encrypted ? <Lock size={16} /> : <LockOpen size={16} />}<div><strong>{status.encrypted ? 'Cifradas (AES-256-GCM)' : 'Sin cifrar'}</strong><span>{status.encrypted ? 'Ilegibles sin BACKUP_KEY' : 'Configura BACKUP_KEY en el servidor'}</span></div></div>
        <div className={`backup-fact ${status.enabled ? 'ok' : ''}`}><RefreshCw size={16} /><div><strong>{status.enabled ? `Diaria desde las ${String(status.hour).padStart(2, '0')}:00` : 'Solo manual'}</strong><span>{status.enabled ? 'Copia automática' : 'Automática solo en producción'}</span></div></div>
      </div>
      {status.backups.length ? <div className="invoice-table-wrap"><table className="invoice-table backups-table"><thead><tr><th>Archivo</th><th>Fecha</th><th className="hide-mobile">Tamaño</th><th className="hide-mobile">Protección</th><th aria-label="Descargar" /></tr></thead><tbody>
        {status.backups.slice(0, 10).map(b => <tr key={b.name}><td className="mono backup-name">{b.name}</td><td>{dateTime(b.createdAt)}</td><td className="hide-mobile">{size(b.size)}</td><td className="hide-mobile">{b.encrypted ? <span className="twofa-badge"><Lock size={11} />Cifrada</span> : <span className="subtle">Sin cifrar</span>}</td>
          <td><a className="icon-btn" href={api.backupDownloadUrl(b.name)} download={b.name} aria-label={`Descargar ${b.name}`} title="Descargar"><Download size={14} /></a></td></tr>)}
      </tbody></table>{status.backups.length > 10 && <p className="section-note">Y {status.backups.length - 10} copias más en <code>{status.directory}</code>.</p>}</div>
        : <p className="section-note">Aún no hay copias en <code>{status.directory}</code>. Crea la primera ahora.</p>}
      <p className="section-note">Restaurar: detén el servidor y ejecuta <code>npm run backup:restore -- &lt;archivo&gt; --yes</code>. Guarda también una copia fuera de este servidor.</p>
    </>}
  </section>;
}
