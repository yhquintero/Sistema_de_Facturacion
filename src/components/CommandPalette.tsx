import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpDown, ChevronRight, CornerDownLeft, FileSignature, FileText, Search, Users, type LucideIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Modal } from './UI';
import { money, statusLabels, displayStatus } from '../lib/format';
import { highlight, matches, score } from '../lib/search';

export interface PaletteCommand {
  id: string;
  group: 'Acciones' | 'Ir a';
  title: string;
  subtitle?: string;
  keywords?: string;
  shortcut?: string;
  icon: LucideIcon;
  run: () => void;
}
interface Entry { key: string; group: string; title: string; subtitle: string; icon: LucideIcon; shortcut?: string; run: () => void; rank: number }

export function Highlight({ text, query }: { text: string; query: string }) {
  return <>{highlight(text, query).map((p, i) => p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>)}</>;
}

/** Paleta de comandos (Ctrl / ⌘ + K): acciones, navegación y búsqueda de documentos con el teclado. */
export default function CommandPalette({ onClose, go, commands }: { onClose: () => void; go: (path: string) => void; commands: PaletteCommand[] }) {
  const { invoices, clients, contracts } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const q = query.trim();

  const entries = useMemo<Entry[]>(() => {
    const cmd = commands.filter(c => matches(`${c.title} ${c.subtitle || ''} ${c.keywords || ''}`, q)).map(c => ({ key: c.id, group: c.group, title: c.title, subtitle: c.subtitle || '', icon: c.icon, shortcut: c.shortcut, run: c.run, rank: score(c.title, q) }));
    if (!q) return [...cmd.filter(c => c.group === 'Acciones'), ...cmd.filter(c => c.group === 'Ir a')];
    const byRank = <T extends { rank: number }>(list: T[]) => list.sort((a, b) => b.rank - a.rank);
    const inv = byRank(invoices.filter(i => matches(`${i.invoiceNumber} ${i.client?.name} ${i.contract?.contractNumber || ''} ${statusLabels[displayStatus(i)]}`, q)).map(i => ({ key: i.id, group: 'Facturas', title: i.invoiceNumber, subtitle: `${i.client?.name || ''} · ${money(i.total, i.currency, true)} · ${statusLabels[displayStatus(i)]}`, icon: FileText, run: () => go(`/invoices/${i.id}`), rank: Math.max(score(i.invoiceNumber, q), score(i.client?.name || '', q)) }))).slice(0, 6);
    const cli = byRank(clients.filter(c => matches(`${c.name} ${c.taxId} ${c.representativeName} ${c.code} ${c.email}`, q)).map(c => ({ key: c.id, group: 'Clientes', title: c.name, subtitle: `Cliente · ${c.code}${c.taxId ? ` · ${c.taxId}` : ''}`, icon: Users, run: () => go(`/clients?edit=${c.id}`), rank: score(c.name, q) }))).slice(0, 4);
    const ctr = byRank(contracts.filter(c => matches(`${c.contractNumber} ${c.title} ${c.clientName || ''}`, q)).map(c => ({ key: c.id, group: 'Contratos', title: c.contractNumber, subtitle: `${c.title}${c.clientName ? ` · ${c.clientName}` : ''}`, icon: FileSignature, run: () => go(`/contracts?edit=${c.id}`), rank: Math.max(score(c.contractNumber, q), score(c.title, q)) }))).slice(0, 4);
    return [...inv, ...cli, ...ctr, ...byRank(cmd)];
  }, [q, commands, invoices, clients, contracts, go]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => entries.length ? (a + 1) % entries.length : 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => entries.length ? (a - 1 + entries.length) % entries.length : 0); }
    else if (e.key === 'Enter') { e.preventDefault(); entries[active]?.run(); }
  };
  let lastGroup = '';
  return <Modal title="Encuentra lo que necesitas" subtitle="Busca documentos o escribe lo que quieres hacer. Atajo: Ctrl / ⌘ + K." onClose={onClose}>
    <div className="command-search"><Search size={19} /><input autoFocus data-autofocus placeholder="Factura, cliente, contrato o una acción…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown} aria-label="Buscar facturas, clientes y contratos" aria-controls="command-results" /></div>
    <div className="command-results" id="command-results" ref={listRef} aria-live="polite">
      {entries.length ? entries.map((r, index) => {
        const header = r.group !== lastGroup ? <div className="command-group" key={`g-${r.group}`}>{r.group}</div> : null; lastGroup = r.group;
        return [header, <button className={`command-result ${index === active ? 'active' : ''}`} data-index={index} key={`${r.group}-${r.key}`} onMouseMove={() => setActive(index)} onClick={r.run}><r.icon size={18} /><div><strong><Highlight text={r.title} query={q} /></strong><span><Highlight text={r.subtitle} query={q} /></span></div>{r.shortcut ? <kbd className="command-kbd">{r.shortcut}</kbd> : <ChevronRight size={14} />}</button>];
      }) : <div className="command-empty"><strong>Sin resultados para «{q}»</strong><span>Prueba con otro nombre, número de documento o acción.</span></div>}
    </div>
    <div className="command-footer" aria-hidden="true"><span><ArrowUpDown size={12} />navegar</span><span><CornerDownLeft size={12} />abrir</span><span><kbd>Esc</kbd>cerrar</span></div>
  </Modal>;
}
