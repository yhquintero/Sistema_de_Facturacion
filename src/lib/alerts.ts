/**
 * Alertas del negocio (funciones puras, sin DOM): facturas vencidas o por vencer, conformidades
 * pendientes, borradores olvidados y contratos que terminan pronto.
 *
 * Se usan en la campana de avisos, el aviso del Resumen y el contador del menú. Probadas en
 * `tests/insights.test.ts`.
 */
import type { Contract, Invoice } from '../../shared/types';

export type Severity = 'alta' | 'media' | 'baja';
export type AlertKind = 'overdue' | 'due_soon' | 'signature' | 'stale_draft' | 'contract_ending' | 'contract_expired';
export interface BusinessAlert {
  id: string;
  kind: AlertKind;
  severity: Severity;
  title: string;
  detail: string;
  path: string;
  amount?: number;
  currency?: string;
  /** Días de retraso (negativo) o que faltan (positivo) respecto a hoy. */
  days?: number;
}

const DAY = 86_400_000;
/** Diferencia en días naturales entre dos fechas ISO (b − a). */
export function daysBetween(a: string, b: string) {
  const t = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((t(b) - t(a)) / DAY);
}
/** Termina la frase con un solo punto (los nombres como «S.R.L.» ya lo traen). */
const end = (text: string) => text.endsWith('.') ? text : `${text}.`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const RANK: Record<Severity, number> = { alta: 0, media: 1, baja: 2 };

export interface AlertOptions { today: string; dueSoonDays?: number; contractDays?: number; staleDraftDays?: number }

export function buildAlerts(invoices: Invoice[], contracts: Contract[], opts: AlertOptions): BusinessAlert[] {
  const { today, dueSoonDays = 7, contractDays = 30, staleDraftDays = 14 } = opts;
  const out: BusinessAlert[] = [];
  for (const inv of invoices) {
    const client = inv.client?.name || 'cliente';
    if (inv.status === 'emitida' || inv.status === 'vencida') {
      const left = daysBetween(today, inv.dueDate);
      if (left < 0) out.push({ id: `overdue-${inv.id}`, kind: 'overdue', severity: 'alta', title: `${inv.invoiceNumber} vencida hace ${plural(-left, 'día', 'días')}`, detail: end(`Cobro pendiente de ${client}`), path: `/invoices/${inv.id}`, amount: inv.total, currency: inv.currency, days: left });
      else if (left <= dueSoonDays) out.push({ id: `due-${inv.id}`, kind: 'due_soon', severity: 'media', title: left === 0 ? `${inv.invoiceNumber} vence hoy` : `${inv.invoiceNumber} vence en ${plural(left, 'día', 'días')}`, detail: end(`Recuerda el cobro a ${client}`), path: `/invoices/${inv.id}`, amount: inv.total, currency: inv.currency, days: left });
    }
    if (inv.status !== 'borrador' && inv.status !== 'anulada' && inv.signatureStatus === 'pendiente_firma') out.push({ id: `sign-${inv.id}`, kind: 'signature', severity: 'media', title: `${inv.invoiceNumber} espera la firma`, detail: end(`Conformidad pendiente de ${client}`), path: `/invoices/${inv.id}?sign=1` });
    if (inv.status === 'borrador') {
      const age = daysBetween((inv.updatedAt || inv.createdAt || inv.issueDate).slice(0, 10), today);
      if (age >= staleDraftDays) out.push({ id: `draft-${inv.id}`, kind: 'stale_draft', severity: 'baja', title: `Borrador sin terminar: ${inv.invoiceNumber}`, detail: `Lleva ${plural(age, 'día', 'días')} sin cambios.`, path: `/invoices/${inv.id}`, days: age });
    }
  }
  for (const c of contracts) {
    if (!c.endDate || !['vigente', 'en_ejecucion'].includes(c.status)) continue;
    const left = daysBetween(today, c.endDate);
    if (left < 0) out.push({ id: `cexp-${c.id}`, kind: 'contract_expired', severity: 'media', title: `Contrato ${c.contractNumber} terminó hace ${plural(-left, 'día', 'días')}`, detail: 'Sigue marcado como activo: renuévalo o finalízalo.', path: `/contracts?edit=${c.id}`, days: left });
    else if (left <= contractDays) out.push({ id: `cend-${c.id}`, kind: 'contract_ending', severity: 'baja', title: left === 0 ? `Contrato ${c.contractNumber} termina hoy` : `Contrato ${c.contractNumber} termina en ${plural(left, 'día', 'días')}`, detail: c.clientName ? end(`Cliente: ${c.clientName}`) : 'Revisa su renovación.', path: `/contracts?edit=${c.id}`, days: left });
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.days ?? 0) - (b.days ?? 0) || a.title.localeCompare(b.title, 'es'));
}

export interface AlertSummary { total: number; high: number; overdue: number; overdueByCurrency: Record<string, number>; dueSoon: number; signatures: number; contracts: number; drafts: number }
export function summarizeAlerts(alerts: BusinessAlert[]): AlertSummary {
  const s: AlertSummary = { total: alerts.length, high: 0, overdue: 0, overdueByCurrency: {}, dueSoon: 0, signatures: 0, contracts: 0, drafts: 0 };
  for (const a of alerts) {
    if (a.severity === 'alta') s.high++;
    if (a.kind === 'overdue') { s.overdue++; if (a.currency) s.overdueByCurrency[a.currency] = (s.overdueByCurrency[a.currency] || 0) + (a.amount || 0); }
    else if (a.kind === 'due_soon') s.dueSoon++;
    else if (a.kind === 'signature') s.signatures++;
    else if (a.kind === 'stale_draft') s.drafts++;
    else s.contracts++;
  }
  return s;
}
export const severityLabel: Record<Severity, string> = { alta: 'Urgente', media: 'Atención', baja: 'Aviso' };
