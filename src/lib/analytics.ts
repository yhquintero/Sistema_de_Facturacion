/**
 * Cálculos de «Análisis y metas» (funciones puras). Importes con impuestos; borradores y
 * anuladas no cuentan. Nunca se mezclan monedas: cada cálculo recibe una.
 */
import type { Invoice, RevenueGoal } from '../../shared/types';
import { daysBetween } from './alerts';

export const isBilled = (i: Invoice) => i.status !== 'borrador' && i.status !== 'anulada';
const isOpen = (i: Invoice) => i.status === 'emitida' || i.status === 'vencida';
const sum = (list: Invoice[]) => Math.round(list.reduce((a, i) => a + i.total, 0) * 100) / 100;
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export interface MonthPoint { key: string; label: string; full: string; billed: number; paid: number; count: number }
/** Serie mensual de `months` meses que termina en el mes de `end`. */
export function monthlySeries(invoices: Invoice[], currency: string, months: number, end: Date): MonthPoint[] {
  const billed = invoices.filter(i => isBilled(i) && i.currency === currency);
  return Array.from({ length: months }, (_, idx) => {
    const d = new Date(end.getFullYear(), end.getMonth() - (months - 1 - idx), 1);
    const key = monthKey(d); const group = billed.filter(i => i.issueDate.startsWith(key));
    const label = d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
    return { key, label: label.charAt(0).toUpperCase() + label.slice(1), full: d.toLocaleDateString('es', { month: 'long', year: 'numeric' }), billed: sum(group), paid: sum(group.filter(i => i.status === 'pagada')), count: group.length };
  });
}

/** Variación porcentual (una cifra decimal); `null` si no hay base para comparar. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round((current - previous) / previous * 1000) / 10;
}

export interface Kpis { thisMonth: number; lastMonth: number; change: number | null; yearToDate: number; bestMonth: MonthPoint | null; averageTicket: number; collectionRate: number; outstanding: number; overdue: number; invoicesThisYear: number }
export function computeKpis(invoices: Invoice[], currency: string, today: string): Kpis {
  const now = new Date(`${today}T12:00:00`);
  const series = monthlySeries(invoices, currency, 12, now);
  const year = invoices.filter(i => isBilled(i) && i.currency === currency && i.issueDate.startsWith(today.slice(0, 4)));
  const all = invoices.filter(i => isBilled(i) && i.currency === currency);
  const billed = sum(all), paid = sum(all.filter(i => i.status === 'pagada'));
  const open = all.filter(isOpen);
  const best = series.reduce<MonthPoint | null>((b, p) => p.billed > 0 && (!b || p.billed > b.billed) ? p : b, null);
  const thisMonth = series[11].billed, lastMonth = series[10].billed;
  return {
    thisMonth, lastMonth, change: percentChange(thisMonth, lastMonth), yearToDate: sum(year), bestMonth: best,
    averageTicket: year.length ? Math.round(sum(year) / year.length * 100) / 100 : 0,
    collectionRate: billed ? Math.round(paid / billed * 1000) / 10 : 0,
    outstanding: sum(open), overdue: sum(open.filter(i => i.dueDate < today)), invoicesThisYear: year.length,
  };
}

export interface AgingBucket { id: string; label: string; amount: number; count: number; tone: 'ok' | 'warn' | 'late' | 'critical' }
/** Antigüedad de lo pendiente de cobro: al día, 1–30, 31–60 y más de 60 días de retraso. */
export function receivablesAging(invoices: Invoice[], currency: string, today: string): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { id: 'current', label: 'Al día', amount: 0, count: 0, tone: 'ok' },
    { id: 'd30', label: '1–30 días', amount: 0, count: 0, tone: 'warn' },
    { id: 'd60', label: '31–60 días', amount: 0, count: 0, tone: 'late' },
    { id: 'd60plus', label: 'Más de 60 días', amount: 0, count: 0, tone: 'critical' },
  ];
  for (const inv of invoices) {
    if (!isOpen(inv) || inv.currency !== currency) continue;
    const late = daysBetween(inv.dueDate, today);
    const b = late <= 0 ? buckets[0] : late <= 30 ? buckets[1] : late <= 60 ? buckets[2] : buckets[3];
    b.amount = Math.round((b.amount + inv.total) * 100) / 100; b.count++;
  }
  return buckets;
}

export interface ClientShare { id: string; name: string; amount: number; count: number; share: number }
/** Clientes que más facturan en el año de `today` (por defecto los 5 primeros). */
export function topClients(invoices: Invoice[], currency: string, today: string, limit = 5): ClientShare[] {
  const year = invoices.filter(i => isBilled(i) && i.currency === currency && i.issueDate.startsWith(today.slice(0, 4)));
  const total = sum(year); const map = new Map<string, ClientShare>();
  for (const inv of year) {
    const row = map.get(inv.clientId) || { id: inv.clientId, name: inv.client?.name || 'Cliente', amount: 0, count: 0, share: 0 };
    row.amount = Math.round((row.amount + inv.total) * 100) / 100; row.count++; map.set(inv.clientId, row);
  }
  return [...map.values()].map(r => ({ ...r, share: total ? Math.round(r.amount / total * 1000) / 10 : 0 })).sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export interface GoalProgress { target: number; actual: number; percent: number; remaining: number; reached: boolean; expected: number; onTrack: boolean }
/**
 * Progreso de una meta. `elapsed` es la fracción del período ya transcurrida (0–1): permite decir
 * si el ritmo actual llega a la meta («vas al día») o no.
 */
export function goalProgress(actual: number, target: number, elapsed: number): GoalProgress | null {
  if (!target || target <= 0) return null;
  const percent = Math.round(actual / target * 1000) / 10;
  const expected = Math.round(target * Math.min(1, Math.max(0, elapsed)) * 100) / 100;
  return { target, actual, percent, remaining: Math.max(0, Math.round((target - actual) * 100) / 100), reached: actual >= target, expected, onTrack: actual >= expected };
}
/** Fracción transcurrida del mes y del año para una fecha ISO. */
export function periodElapsed(today: string) {
  const d = new Date(`${today}T12:00:00`); const y = d.getFullYear(), m = d.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1), t = Date.UTC(y, m, d.getDate());
  return { month: d.getDate() / daysInMonth, year: (t - start + 86_400_000) / (end - start) };
}
export function goalFor(goals: Record<string, RevenueGoal>, currency: string): RevenueGoal { return goals[currency] || { monthly: 0, yearly: 0 }; }
