import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarRange, CircleDollarSign, Download, Hourglass, Pencil, Printer, Receipt, Target, TrendingDown, TrendingUp, Trophy, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../components/AuthGate';
import { ErrorMessage, Field, Modal, PageHeader, SaveButton } from '../components/UI';
import { csvCell, downloadText, money, today } from '../lib/format';
import { computeKpis, goalFor, goalProgress, monthlySeries, periodElapsed, receivablesAging, topClients, type GoalProgress, type MonthPoint } from '../lib/analytics';
import { api } from '../api';
import type { RevenueGoal } from '../../shared/types';

function Kpi({ label, value, note, tone, trend }: { label: string; value: string; note: string; tone: 'green' | 'blue' | 'gold' | 'violet'; trend?: number | null }) {
  return <div className={`kpi-card ${tone}`}><span className="kpi-label">{label}</span><strong className="kpi-value mono">{value}</strong><span className="kpi-note">{trend !== undefined && trend !== null && <span className={`kpi-trend ${trend >= 0 ? 'up' : 'down'}`}>{trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{trend >= 0 ? '+' : ''}{trend.toLocaleString('es')}%</span>}{note}</span></div>;
}

function GoalBar({ title, progress, currency, emptyText }: { title: string; progress: GoalProgress | null; currency: string; emptyText: string }) {
  if (!progress) return <div className="goal-row empty"><div className="goal-head"><strong>{title}</strong><span>Sin meta</span></div><p>{emptyText}</p></div>;
  const width = Math.min(100, progress.percent); const marker = Math.min(100, progress.expected / progress.target * 100);
  return <div className="goal-row"><div className="goal-head"><strong>{title}</strong><span className="mono">{money(progress.actual, currency)} / {money(progress.target, currency)}</span></div>
    <div className="goal-track" role="progressbar" aria-label={`${title}: ${progress.percent}% de la meta`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)}><span className={`goal-fill ${progress.reached ? 'reached' : progress.onTrack ? 'on-track' : 'behind'}`} style={{ width: `${width}%` }} /><span className="goal-marker" style={{ left: `${marker}%` }} title="Lo esperado a día de hoy" /></div>
    <p className={progress.reached ? 'goal-ok' : progress.onTrack ? 'goal-ok' : 'goal-warn'}>{progress.reached ? <><Trophy size={12} />¡Meta cumplida! {progress.percent}%</> : <>Faltan {money(progress.remaining, currency)} ({progress.percent}%) · {progress.onTrack ? 'vas al ritmo para lograrla' : `a día de hoy deberías llevar ${money(progress.expected, currency)}`}</>}</p></div>;
}

function TrendChart({ data, currency, goal }: { data: MonthPoint[]; currency: string; goal: number }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 960, H = 280, left = 58, right = 14, top = 16, bottom = 30; const plotW = W - left - right, plotH = H - top - bottom;
  const peak = Math.max(100, goal, ...data.map(d => d.billed));
  const step = Math.pow(10, Math.floor(Math.log10(peak))) / 2; const max = Math.ceil(peak * 1.08 / step) * step;
  const y = (v: number) => top + plotH - v / max * plotH; const slot = plotW / data.length; const bw = Math.min(34, slot * .58);
  const label = (v: number) => v >= 1000 ? `${(v / 1000).toLocaleString('es', { maximumFractionDigits: 1 })}k` : String(Math.round(v));
  return <div className="trend-chart-wrap"><svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Facturación mensual en ${currency} de los últimos ${data.length} meses${goal ? `, meta mensual ${money(goal, currency)}` : ''}`}>
    {Array.from({ length: 5 }, (_, i) => { const v = max * i / 4; return <g key={i}><line className="chart-grid" x1={left} x2={W - right} y1={y(v)} y2={y(v)} /><text className="chart-label" x={left - 8} y={y(v) + 3} textAnchor="end">{label(v)}</text></g>; })}
    {data.map((d, i) => { const x = left + slot * i + (slot - bw) / 2; return <g key={d.key} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} tabIndex={0} aria-label={`${d.full}: ${money(d.billed, currency)} facturados, ${money(d.paid, currency)} cobrados`}>
      <rect className="trend-hit" x={left + slot * i} y={top} width={slot} height={plotH} />
      <rect className={`trend-bar ${goal && d.billed >= goal ? 'over' : ''} ${active === i ? 'active' : ''}`} x={x} y={y(d.billed)} width={bw} height={Math.max(0, top + plotH - y(d.billed))} rx={4} />
      <rect className="trend-bar-paid" x={x + bw * .28} y={y(d.paid)} width={bw * .44} height={Math.max(0, top + plotH - y(d.paid))} rx={2} />
      <text className="chart-label" x={left + slot * i + slot / 2} y={H - 10} textAnchor="middle">{d.label}</text></g>; })}
    {goal > 0 && <g className="trend-goal"><line x1={left} x2={W - right} y1={y(goal)} y2={y(goal)} /><text x={W - right} y={y(goal) - 6} textAnchor="end">Meta {money(goal, currency)}</text></g>}
    {active !== null && (() => { const d = data[active]; const cx = Math.min(W - right - 75, Math.max(left + 75, left + slot * active + slot / 2)); const ty = Math.max(top, y(d.billed) - 50); return <g pointerEvents="none" className="chart-tooltip"><rect x={cx - 75} y={ty} width={150} height={42} rx={7} /><text x={cx} y={ty + 16} textAnchor="middle" className="tt-title">{d.full}</text><text x={cx} y={ty + 32} textAnchor="middle" className="tt-value">{money(d.billed, currency)} · cobrado {money(d.paid, currency)}</text></g>; })()}
  </svg>
  <div className="trend-legend"><span><i className="lg-billed" />Facturado</span><span><i className="lg-paid" />Cobrado</span>{goal > 0 && <span><i className="lg-goal" />Meta mensual</span>}</div>
  <details className="chart-table"><summary>Ver datos de la gráfica en tabla</summary><table className="invoice-table compact chart-data-table"><thead><tr><th>Mes</th><th className="num">Facturas</th><th className="num">Facturado</th><th className="num">Cobrado</th>{goal > 0 && <th className="num">% de la meta</th>}</tr></thead><tbody>{data.map(d => <tr key={d.key}><td>{d.full}</td><td className="num">{d.count}</td><td className="num mono">{money(d.billed, currency)}</td><td className="num mono">{money(d.paid, currency)}</td>{goal > 0 && <td className="num">{Math.round(d.billed / goal * 100)}%</td>}</tr>)}</tbody></table></details></div>;
}

function GoalsDialog({ currency, goal, onClose }: { currency: string; goal: RevenueGoal; onClose: () => void }) {
  const { goals, refresh, notify } = useApp();
  const [monthly, setMonthly] = useState(goal.monthly ? String(goal.monthly) : ''); const [yearly, setYearly] = useState(goal.yearly ? String(goal.yearly) : '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const m = Number(monthly || 0), y = Number(yearly || 0);
    if (!Number.isFinite(m) || !Number.isFinite(y) || m < 0 || y < 0) { setError('Escribe importes positivos o déjalos vacíos.'); return; }
    setBusy(true); setError('');
    try { await api.saveGoals({ ...goals, [currency]: { monthly: m, yearly: y } }); await refresh(); notify(`Metas en ${currency} guardadas.`); onClose(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return <Modal title={`Metas de facturación · ${currency}`} subtitle="Importes con impuestos. Deja un campo vacío para no fijar esa meta." onClose={onClose}><form onSubmit={submit}><div className="form-grid">
    <Field label={`Meta mensual (${currency})`} hint="Lo que quieres facturar cada mes."><input inputMode="decimal" type="number" min="0" step="0.01" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="Ej. 3000" /></Field>
    <Field label={`Meta anual (${currency})`} hint={monthly && !yearly ? `Sugerencia: ${money(Number(monthly) * 12, currency)} (12 meses).` : 'Lo que quieres facturar en el año.'}><input inputMode="decimal" type="number" min="0" step="0.01" value={yearly} onChange={e => setYearly(e.target.value)} placeholder="Ej. 36000" /></Field></div>
    <ErrorMessage error={error} /><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button><SaveButton busy={busy} label="Guardar metas" /></div></form></Modal>;
}

export default function AnalyticsView() {
  const { invoices, supplier, goals, navigate, notify } = useApp(); const auth = useAuth();
  const currencies = Array.from(new Set([supplier.defaultCurrency, ...invoices.map(i => i.currency), ...Object.keys(goals)]));
  const [currency, setCurrency] = useState(supplier.defaultCurrency); const [months, setMonths] = useState(12); const [editing, setEditing] = useState(false);
  const day = today(); const now = new Date(`${day}T12:00:00`);
  const kpis = useMemo(() => computeKpis(invoices, currency, day), [invoices, currency, day]);
  const series = useMemo(() => monthlySeries(invoices, currency, months, now), [invoices, currency, months, day]);
  const aging = useMemo(() => receivablesAging(invoices, currency, day), [invoices, currency, day]);
  const clientsTop = useMemo(() => topClients(invoices, currency, day), [invoices, currency, day]);
  const goal = goalFor(goals, currency); const elapsed = periodElapsed(day);
  const monthGoal = goalProgress(kpis.thisMonth, goal.monthly, elapsed.month); const yearGoal = goalProgress(kpis.yearToDate, goal.yearly, elapsed.year);
  const agingTotal = aging.reduce((a, b) => a + b.amount, 0); const canEditGoals = auth.can('supplier.write');
  const monthName = now.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const exportCsv = () => { const rows = [['Mes', 'Facturas', `Facturado (${currency})`, `Cobrado (${currency})`, `Meta mensual (${currency})`], ...series.map(d => [d.full, d.count, d.billed, d.paid, goal.monthly || ''])]; downloadText(rows.map(r => r.map(csvCell).join(',')).join('\r\n'), `Analisis_${currency}_${day}.csv`); notify('Análisis descargado en CSV.'); };
  return <div className="analytics-page">
    <PageHeader eyebrow={`Análisis · ${monthName}`} title="Análisis y metas" description="Cómo evoluciona tu facturación, qué tan rápido cobras y si vas camino de tus metas." actions={<><select className="small-select" aria-label="Moneda del análisis" value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select><button className="btn btn-secondary no-print" onClick={exportCsv}><Download size={14} />CSV</button><button className="btn btn-secondary no-print" onClick={() => window.print()}><Printer size={14} />Imprimir informe</button></>} />
    <div className="print-only print-header"><strong>{supplier.businessName}</strong><span>Informe de análisis y metas · {currency} · {new Date().toLocaleString('es')}</span></div>
    <p className="section-note">Análisis comercial según fechas y estados de factura; «cobrado» no sustituye los ingresos percibidos documentados. Para preparación ONAT, contrasta el libro y la conciliación en Fiscal · Cuba / ONAT.</p>
    <div className="kpi-grid">
      <Kpi tone="green" label="Facturado este mes" value={money(kpis.thisMonth, currency)} trend={kpis.change} note={kpis.change === null ? 'sin datos del mes anterior' : ' vs. mes anterior'} />
      <Kpi tone="blue" label="Acumulado del año" value={money(kpis.yearToDate, currency)} note={`${kpis.invoicesThisYear} ${kpis.invoicesThisYear === 1 ? 'factura' : 'facturas'} en ${day.slice(0, 4)}`} />
      <Kpi tone="gold" label="Ticket promedio" value={money(kpis.averageTicket, currency)} note={kpis.bestMonth ? `Mejor mes: ${kpis.bestMonth.full} (${money(kpis.bestMonth.billed, currency)})` : 'Aún no hay meses con facturas'} />
      <Kpi tone="violet" label="Tasa de cobro" value={`${kpis.collectionRate.toLocaleString('es')}%`} note={`Pendiente: ${money(kpis.outstanding, currency)}`} />
    </div>
    <div className="analytics-grid">
      <section className="panel goals-panel"><div className="panel-header"><div className="panel-header-icon"><Target size={15} /><h2>Metas</h2></div>{canEditGoals && <button className="btn btn-secondary btn-sm no-print" onClick={() => setEditing(true)}><Pencil size={13} />{goal.monthly || goal.yearly ? 'Editar metas' : 'Fijar metas'}</button>}</div>
        <div className="goal-list"><GoalBar title={`Este mes (${now.toLocaleDateString('es', { month: 'long' })})`} progress={monthGoal} currency={currency} emptyText={canEditGoals ? 'Fija una meta mensual para ver tu avance y si vas al ritmo.' : 'Un administrador puede fijar una meta mensual.'} /><GoalBar title={`Año ${day.slice(0, 4)}`} progress={yearGoal} currency={currency} emptyText={canEditGoals ? 'Fija una meta anual para seguir el acumulado.' : 'Un administrador puede fijar una meta anual.'} /></div>
        <p className="section-note"><CalendarRange size={11} />La marca vertical indica lo esperado a día de hoy ({Math.round(elapsed.month * 100)}% del mes transcurrido).</p></section>
      <section className="panel aging-panel"><div className="panel-header"><div className="panel-header-icon"><Hourglass size={15} /><h2>Antigüedad del cobro</h2></div><span className="count-pill mono">{money(agingTotal, currency)}</span></div>
        {agingTotal > 0 ? <><div className="aging-bar" aria-hidden="true">{aging.filter(b => b.amount > 0).map(b => <span key={b.id} className={`aging-seg ${b.tone}`} style={{ flexGrow: b.amount }} />)}</div>
          <ul className="aging-list">{aging.map(b => <li key={b.id}><span className={`aging-dot ${b.tone}`} /><span className="aging-label">{b.label}<small>{b.count} {b.count === 1 ? 'factura' : 'facturas'}</small></span><strong className="mono">{money(b.amount, currency)}</strong><span className="aging-share">{agingTotal ? Math.round(b.amount / agingTotal * 100) : 0}%</span></li>)}</ul>
          {kpis.overdue > 0 && <button className="text-link no-print" onClick={() => navigate('/invoices?status=vencida')}>Ver facturas vencidas<ArrowRight size={11} /></button>}</>
          : <div className="analytics-empty"><CircleDollarSign size={22} /><strong>Nada pendiente de cobro</strong><span>Todas tus facturas en {currency} están cobradas.</span></div>}</section>
    </div>
    <section className="panel"><div className="panel-header"><div><h2>Tendencia de la facturación</h2><p>Barras: facturado por mes. Interior: lo ya cobrado.{goal.monthly ? ' Línea discontinua: meta mensual.' : ''}</p></div><select className="small-select no-print" aria-label="Meses de la tendencia" value={months} onChange={e => setMonths(Number(e.target.value))}><option value={6}>6 meses</option><option value={12}>12 meses</option><option value={24}>24 meses</option></select></div><TrendChart data={series} currency={currency} goal={goal.monthly} /></section>
    <section className="panel"><div className="panel-header"><div className="panel-header-icon"><Users size={15} /><h2>Clientes que más facturan en {day.slice(0, 4)}</h2></div><Receipt size={15} className="icon-soft" /></div>
      {clientsTop.length ? <ul className="share-list">{clientsTop.map((c, i) => <li key={c.id}><span className="share-rank mono">{String(i + 1).padStart(2, '0')}</span><span className="share-name">{c.name}<small>{c.count} {c.count === 1 ? 'factura' : 'facturas'}</small></span><span className="share-track"><span style={{ width: `${Math.max(2, c.share)}%` }} /></span><strong className="mono">{money(c.amount, currency)}</strong><span className="share-pct">{c.share.toLocaleString('es')}%</span></li>)}</ul>
        : <div className="analytics-empty"><Users size={22} /><strong>Sin facturas en {day.slice(0, 4)}</strong><span>Cuando emitas facturas en {currency}, verás aquí a tus mejores clientes.</span></div>}</section>
    {editing && <GoalsDialog currency={currency} goal={goal} onClose={() => setEditing(false)} />}
  </div>;
}
