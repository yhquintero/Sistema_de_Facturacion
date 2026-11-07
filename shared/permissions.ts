/**
 * Roles y permisos del espacio de trabajo.
 * El servidor es la única autoridad: la interfaz usa esta misma matriz solo para ocultar
 * o deshabilitar acciones que el servidor rechazaría.
 */
export const USER_ROLES = ['admin', 'gestor', 'tecnico', 'lectura'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = [
  'users.manage',
  'supplier.write',
  'catalog.write',
  'clients.write',
  'contracts.write',
  'invoices.draft',
  'invoices.issue',
  'invoices.delete',
  'invoices.sign',
  'fiscal.read',
  'fiscal.write',
  'security.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  gestor: ['fiscal.read', 'fiscal.write', 'catalog.write', 'clients.write', 'contracts.write', 'invoices.draft', 'invoices.issue', 'invoices.delete', 'invoices.sign'],
  tecnico: ['invoices.draft', 'invoices.sign'],
  lectura: ['fiscal.read'],
};

export const ROLE_INFO: Record<UserRole, { label: string; short: string; description: string }> = {
  admin: { label: 'Administrador', short: 'Admin', description: 'Control total: usuarios, datos del Suministrador, catálogo, clientes, contratos y facturas.' },
  gestor: { label: 'Gestor de facturación', short: 'Gestor', description: 'Clientes, contratos, catálogo, ciclo completo de facturas y libro fiscal auxiliar.' },
  tecnico: { label: 'Técnico', short: 'Técnico', description: 'Prepara borradores con el desglose técnico por equipo y recoge la firma del Cliente Final. No emite ni cambia cobros.' },
  lectura: { label: 'Solo lectura', short: 'Lectura', description: 'Consulta datos comerciales y auxiliares fiscales, y descarga documentos. No modifica nada.' },
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'users.manage': 'Gestionar usuarios y accesos',
  'supplier.write': 'Editar Mi negocio (Suministrador)',
  'catalog.write': 'Editar el catálogo de servicios',
  'clients.write': 'Crear, editar y eliminar clientes',
  'contracts.write': 'Crear, editar y eliminar contratos',
  'invoices.draft': 'Crear y editar borradores de factura',
  'invoices.issue': 'Emitir, anular y cambiar el estado de cobro (sin reescribir contenido emitido)',
  'invoices.delete': 'Eliminar borradores',
  'invoices.sign': 'Registrar la firma del Cliente Final',
  'fiscal.read': 'Consultar y exportar el libro fiscal auxiliar',
  'fiscal.write': 'Registrar movimientos, reversiones y perfil fiscal',
  'security.read': 'Consultar el estado de seguridad operativa',
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
export function roleCan(role: UserRole | undefined | null, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

export type SessionUser = { id: string; username: string; displayName: string; role: UserRole; mustChangePassword: boolean };
export type WorkspaceUser = SessionUser & { active: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; passwordChangedAt: string };
export type SecurityEvent = { id: number; type: string; occurredAt: string; actorName: string; targetName: string; ip: string; details: Record<string, unknown> };
export type SessionInfo = {
  protected: boolean;
  authenticated: boolean;
  demo: boolean;
  user: SessionUser | null;
  permissions: Permission[];
  /** true cuando no hay cuentas y el servidor permite crear el primer administrador desde la interfaz. */
  setupAvailable: boolean;
  csrfToken?: string;
};

export const PASSWORD_MIN_LENGTH = 14;
export const PASSWORD_MAX_LENGTH = 1024;
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;
