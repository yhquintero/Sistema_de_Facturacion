import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, LoaderCircle, X } from 'lucide-react';
import { api } from '../api';
import type { Client, Contract, Invoice, RevenueGoals, ServiceCatalogItem, SupplierProfile } from '../../shared/types';

type Data = { supplier: SupplierProfile; clients: Client[]; contracts: Contract[]; invoices: Invoice[]; catalog: ServiceCatalogItem[]; goals: RevenueGoals };
type Toast = { id: number; message: string; kind: 'success' | 'error' };
type ContextValue = Data & { realtime: 'connecting' | 'live' | 'offline' | 'reconnecting'; lastSync: string; refresh: () => Promise<void>; notify: (message: string, kind?: Toast['kind']) => void; navigate: (path: string) => void };
const AppContext = createContext<ContextValue | null>(null);
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('App context missing'); return value; }
export function navigate(path: string) { window.location.hash = path.startsWith('/') ? path : `/${path}`; }
export function useRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => { const update = () => { setRoute(window.location.hash.slice(1) || '/'); window.scrollTo({ top: 0 }); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  return route;
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [realtime, setRealtime] = useState<ContextValue['realtime']>('connecting'); const [lastSync, setLastSync] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const requestSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const [supplier, clients, contracts, invoices, catalog, goals] = await Promise.all([api.getSupplier(), api.listClients(), api.listContracts(), api.listInvoices(), api.listCatalog(), api.getGoals()]);
    if (sequence === requestSequence.current) { setData({ supplier, clients, contracts, invoices, catalog, goals }); setLastSync(new Date().toISOString()); setError(''); }
  }, []);
  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-3), { id, message, kind }]);
    window.setTimeout(() => setToasts(t => t.filter(item => item.id !== id)), kind === 'error' ? 8000 : 4500);
  }, []);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
  useEffect(() => {
    let timer = 0; const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { void refresh().catch(() => setRealtime('reconnecting')); }, 250); };
    const stream = new EventSource('/api/events');
    stream.addEventListener('connected', () => { setRealtime('live'); schedule(); }); stream.addEventListener('changed', () => { window.dispatchEvent(new Event('session-changed')); schedule(); });
    stream.addEventListener('session-expired', () => { stream.close(); window.dispatchEvent(new Event('session-expired')); });
    stream.onerror = () => setRealtime(navigator.onLine ? 'reconnecting' : 'offline');
    const online = () => { setRealtime('reconnecting'); schedule(); }, offline = () => setRealtime('offline');
    const visible = () => { if (document.visibilityState === 'visible') schedule(); };
    window.addEventListener('online', online); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', visible);
    return () => { stream.close(); window.clearTimeout(timer); window.removeEventListener('online', online); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  if (!data) return <div className="boot-screen"><div className="brand-symbol"><span /><span /><span /></div><h1>Nexo<span>.</span></h1>{error ? <><p role="alert">No se pudo conectar con el servidor. {error}</p><button className="btn btn-primary" onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Volver a intentar</button></> : <><LoaderCircle className="spin" size={22} /><p>Preparando tu espacio de trabajo…</p></>}</div>;
  return <AppContext.Provider value={{ ...data, refresh, notify, navigate, realtime, lastSync }}>{children}<div className="toast-stack" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>{t.kind === 'success' ? <Check size={18} /> : <CircleAlert size={18} />}<span>{t.message}</span><button className="icon-btn" aria-label="Cerrar aviso" onClick={() => setToasts(s => s.filter(i => i.id !== t.id))}><X size={16} /></button></div>)}</div></AppContext.Provider>;
}
