import type { FiscalProfile, FiscalEntryInput, FiscalEntry, FiscalReport } from '../shared/fiscal';
import type { SecurityStatus } from '../shared/security';
import { csrfHeaders } from './lib/security';
import type { InvoiceAuditEvent, InvoiceIntegrity } from './components/InvoiceAudit';
import type { PaperOrientation, PaperSizeId } from '../shared/paperStandards';
import type { BackupStatus, OwnSession, SecurityEvent, SessionInfo, TwoFactorSetup, UserRole, WorkspaceUser } from '../shared/permissions';
import type {
  Client,
  Contract,
  DashboardStats,
  Invoice,
  InvoiceStatus,
  RevenueGoals,
  ServiceCatalogItem,
  SupplierProfile,
} from '../shared/types';

export type SessionExpiredDetail = { code?: string; message?: string };
export const notifySessionExpired = (detail: SessionExpiredDetail = {}) => window.dispatchEvent(new CustomEvent<SessionExpiredDetail>('session-expired', { detail }));

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = `Error HTTP ${res.status}`; let code = '';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
      code = data?.code || '';
      if (code === 'PASSWORD_CHANGE_REQUIRED' || code === 'TWO_FACTOR_SETUP_REQUIRED') window.dispatchEvent(new Event('session-changed'));
    } catch {
      // ignore
    }
    if (res.status === 401) notifySessionExpired({ code, message: msg });
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  getFiscalReport: (year: number) => requestJson<FiscalReport>(`/api/fiscal/report?year=${year}`),
  saveFiscalProfile: (data: FiscalProfile) => requestJson<FiscalProfile>('/api/fiscal/profile', { method: 'PUT', body: JSON.stringify(data) }),
  postFiscalEntry: (data: FiscalEntryInput) => requestJson<FiscalEntry>('/api/fiscal/entries', { method: 'POST', body: JSON.stringify(data) }),
  reverseFiscalEntry: (id: string, data: { occurredOn: string; reason: string; idempotencyKey: string }) => requestJson<FiscalEntry>(`/api/fiscal/entries/${encodeURIComponent(id)}/reverse`, { method: 'POST', body: JSON.stringify(data) }),
  getSecurityStatus: () => requestJson<SecurityStatus>('/api/security/status'),
  downloadFiscal: async (year: number, format: 'xlsx' | 'csv' | 'zip') => {
    const response = await fetch(`/api/fiscal/export/${format}?year=${year}`, { cache: 'no-store' });
    if (!response.ok) { if (response.status === 401) window.dispatchEvent(new Event('session-expired')); const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No se pudo generar el expediente fiscal.'); }
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `AUXILIAR_NO_OFICIAL_CUBA_${year}.${format}`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
  getHealth: () =>
    requestJson<{ ok: boolean; service: string; timestamp: string }>('/api/health'),

  getDashboard: () =>
    requestJson<{ stats: DashboardStats; recentInvoices: Invoice[] }>('/api/dashboard'),

  getSupplier: () => requestJson<SupplierProfile>('/api/supplier'),
  updateSupplier: (data: Partial<SupplierProfile>) =>
    requestJson<SupplierProfile>('/api/supplier', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getGoals: () => requestJson<RevenueGoals>('/api/goals'),
  saveGoals: (goals: RevenueGoals) => requestJson<RevenueGoals>('/api/goals', { method: 'PUT', body: JSON.stringify(goals) }),

  listClients: () => requestJson<Client[]>('/api/clients'),
  createClient: (data: Omit<Client, 'id' | 'createdAt'>) =>
    requestJson<Client>('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id: string, data: Partial<Client>) =>
    requestJson<Client>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/clients/${id}`, { method: 'DELETE' }),

  listContracts: () => requestJson<Contract[]>('/api/contracts'),
  createContract: (data: Omit<Contract, 'id' | 'createdAt' | 'clientName'>) =>
    requestJson<Contract>('/api/contracts', { method: 'POST', body: JSON.stringify(data) }),
  updateContract: (id: string, data: Partial<Contract>) =>
    requestJson<Contract>(`/api/contracts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContract: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/contracts/${id}`, { method: 'DELETE' }),

  listCatalog: () => requestJson<ServiceCatalogItem[]>('/api/catalog'),
  createCatalogItem: (data: Omit<ServiceCatalogItem, 'id'>) =>
    requestJson<ServiceCatalogItem>('/api/catalog', { method: 'POST', body: JSON.stringify(data) }),
  updateCatalogItem: (id: string, data: Partial<ServiceCatalogItem>) =>
    requestJson<ServiceCatalogItem>(`/api/catalog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCatalogItem: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/catalog/${id}`, { method: 'DELETE' }),

  listInvoices: () => requestJson<Invoice[]>('/api/invoices'),
  getInvoice: (id: string) => requestJson<Invoice>(`/api/invoices/${id}`),
  getInvoiceIntegrity: (id: string) => requestJson<InvoiceIntegrity>(`/api/invoices/${id}/integrity`),
  getInvoiceEvents: (id: string) => requestJson<InvoiceAuditEvent[]>(`/api/invoices/${id}/events`),
  createInvoice: (data: Partial<Invoice> & { clientId: string }) =>
    requestJson<Invoice>('/api/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id: string, data: Partial<Invoice> & { clientId: string }) =>
    requestJson<Invoice>(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateInvoiceStatus: (id: string, status: InvoiceStatus) =>
    requestJson<Invoice>(`/api/invoices/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  signInvoice: (
    id: string,
    payload: {
      clientSignerName: string;
      clientSignerId: string;
      clientSignerRole: string;
      clientSignatureDataUrl: string;
      consent: boolean;
      expectedUpdatedAt: string;
    }
  ) =>
    requestJson<Invoice>(`/api/invoices/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteInvoice: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/invoices/${id}`, { method: 'DELETE' }),

  listUsers: () => requestJson<(WorkspaceUser & { activeSessions: number })[]>('/api/users'),
  createUser: (data: { username: string; displayName: string; role: UserRole; password: string; mustChangePassword: boolean }) =>
    requestJson<WorkspaceUser>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: { displayName?: string; role?: UserRole; active?: boolean; password?: string; mustChangePassword?: boolean; resetTwoFactor?: true }) =>
    requestJson<WorkspaceUser>(`/api/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  revokeUserSessions: (id: string) =>
    requestJson<{ ok: boolean; revoked: number }>(`/api/users/${encodeURIComponent(id)}/sessions`, { method: 'DELETE' }),
  listSecurityEvents: (limit = 60) => requestJson<SecurityEvent[]>(`/api/security-events?limit=${limit}`),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    requestJson<SessionInfo>('/api/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  getOwnSecurity: () => requestJson<{ twoFactorEnabled: boolean; recoveryCodesLeft: number; passwordChangedAt: string; idleMinutes: number; maxHours: number; requireAdminTwoFactor: boolean }>('/api/me/security'),
  startTwoFactorSetup: () => requestJson<TwoFactorSetup>('/api/me/2fa/setup', { method: 'POST', body: '{}' }),
  enableTwoFactor: (code: string) => requestJson<{ recoveryCodes: string[]; session: SessionInfo }>('/api/me/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
  disableTwoFactor: (password: string, code: string) => requestJson<SessionInfo>('/api/me/2fa/disable', { method: 'POST', body: JSON.stringify({ password, code }) }),
  regenerateRecoveryCodes: (code: string) => requestJson<{ recoveryCodes: string[] }>('/api/me/2fa/recovery-codes', { method: 'POST', body: JSON.stringify({ code }) }),
  listOwnSessions: () => requestJson<OwnSession[]>('/api/me/sessions'),
  revokeOwnSession: (id: string | 'others') => requestJson<{ ok: boolean; revoked: number }>(`/api/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getBackups: () => requestJson<BackupStatus>('/api/backups'),
  createBackup: () => requestJson<BackupStatus>('/api/backups', { method: 'POST', body: '{}' }),
  backupDownloadUrl: (name: string) => `/api/backups/${encodeURIComponent(name)}`,
  setupFirstAdmin: (data: { username: string; displayName: string; password: string }) =>
    requestJson<SessionInfo>('/api/setup', { method: 'POST', body: JSON.stringify(data) }),

  getExportUrl: (
    invoiceId: string,
    format: 'pdf' | 'docx' | 'xlsx',
    paper: PaperSizeId,
    orientation: PaperOrientation,
    inline = false
  ) =>
    `/api/invoices/${encodeURIComponent(invoiceId)}/export/${format}?paper=${encodeURIComponent(
      paper
    )}&orientation=${encodeURIComponent(orientation)}${inline ? '&inline=1' : ''}`,

  downloadExport: async (
    invoiceId: string,
    invoiceNumber: string,
    format: 'pdf' | 'docx' | 'xlsx',
    paper: PaperSizeId,
    orientation: PaperOrientation
  ) => {
    const url = `/api/invoices/${encodeURIComponent(
      invoiceId
    )}/export/${format}?paper=${encodeURIComponent(paper)}&orientation=${encodeURIComponent(
      orientation
    )}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) notifySessionExpired();
      let msg = `No se pudo generar el archivo .${format}`;
      try {
        const err = await res.json();
        if (err?.error) msg = err.error;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    const safeInv = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `${safeInv}_${paper}_${orientation === 'landscape' ? 'Horizontal' : 'Vertical'}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  },
};

export function formatCurrencyUI(amount: number, currency = 'USD'): string {
  const num = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${num} ${currency}`;
}
