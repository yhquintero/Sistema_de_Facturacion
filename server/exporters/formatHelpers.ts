import { SUPPORTED_CURRENCIES, type ActivityScope, type ActivityType, type InvoiceStatus } from '../../shared/types';

export function formatMoney(amount: number, currencyCode = 'USD'): string {
  const def = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
  const symbol = def ? def.symbol : '$';
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted} ${currencyCode}`;
}

export function formatMoneyCompact(amount: number, currencyCode = 'USD'): string {
  const def = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
  const symbol = def ? def.symbol : '$';
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

export function activityLabel(type: ActivityType): string {
  return type === 'principal' ? 'Act. Principal (Software)' : 'Act. Secundaria (Soporte/Inst.)';
}

export function scopeLabel(scope: ActivityScope): string {
  if (scope === 'principal') return 'Actividad Principal — Desarrollo Multiplataforma';
  if (scope === 'secundaria') return 'Actividad Secundaria — Soporte Técnico e Instalación';
  return 'Actividad Mixta (Principal: Desarrollo + Secundaria: Soporte e Instalación)';
}

export function statusLabel(status: InvoiceStatus): string {
  const map: Record<InvoiceStatus, string> = {
    borrador: 'BORRADOR',
    emitida: 'EMITIDA',
    pagada: 'PAGADA',
    vencida: 'VENCIDA',
    anulada: 'ANULADA',
  };
  return map[status] || status.toUpperCase();
}

export function sanitizeFilename(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}
