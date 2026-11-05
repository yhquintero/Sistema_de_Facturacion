import type { ActivityScope, Invoice, InvoiceStatus } from '../../shared/types';

export function money(value: number, currency = 'USD', withCode = false) {
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
  return withCode ? `${formatted} ${currency}` : formatted;
}
export function number(value: number) { return new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(value); }
export function date(value: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return '—';
  return new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('es', options || { day: '2-digit', month: 'short', year: 'numeric' });
}
export function today() { return new Date().toISOString().slice(0, 10); }
export function afterDays(days: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function uid(prefix = 'item') { return `${prefix}-${crypto.randomUUID()}`; }
export function initials(name: string) { return name.replace(/^(Ing\.|Lic\.|Arq\.)\s*/i, '').split(/[\s&]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'CL'; }
export const statusLabels: Record<InvoiceStatus, string> = { borrador: 'Borrador', emitida: 'Pendiente', pagada: 'Pagada', vencida: 'Vencida', anulada: 'Anulada' };
export const scopeLabels: Record<ActivityScope, string> = { principal: 'Desarrollo', secundaria: 'Soporte técnico', ambas: 'Desarrollo + soporte' };
export function displayStatus(invoice: Invoice): InvoiceStatus { return invoice.status === 'emitida' && invoice.dueDate < today() ? 'vencida' : invoice.status; }
export function isRevenue(invoice: Invoice) { return invoice.status !== 'borrador' && invoice.status !== 'anulada'; }
export function downloadText(content: string, name: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}
