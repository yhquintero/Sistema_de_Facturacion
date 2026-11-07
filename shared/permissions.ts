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
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  gestor: ['catalog.write', 'clients.write', 'contracts.write', 'invoices.draft', 'invoices.issue', 'invoices.delete', 'invoices.sign'],
  tecnico: ['invoices.draft', 'invoices.sign'],
  lectura: [],
};

export const ROLE_INFO: Record<UserRole, { label: string; short: string; description: string }> = {
  admin: { label: 'Administrador', short: 'Admin', description: 'Control total: usuarios, datos del Suministrador, catálogo, clientes, contratos y facturas.' },
  gestor: { label: 'Gestor de facturación', short: 'Gestor', description: 'Clientes, contratos, catálogo y ciclo completo de facturas: emitir, cobrar, anular y eliminar borradores.' },
  tecnico: { label: 'Técnico', short: 'Técnico', description: 'Prepara borradores con el desglose técnico por equipo y recoge la firma del Cliente Final. No emite ni cambia cobros.' },
  lectura: { label: 'Solo lectura', short: 'Lectura', description: 'Consulta facturas, clientes, contratos y catálogo, y descarga documentos. No modifica nada.' },
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'users.manage': 'Gestionar usuarios y accesos',
  'supplier.write': 'Editar Mi negocio (Suministrador)',
  'catalog.write': 'Editar el catálogo de servicios',
  'clients.write': 'Crear, editar y eliminar clientes',
  'contracts.write': 'Crear, editar y eliminar contratos',
  'invoices.draft': 'Crear y editar borradores de factura',
  'invoices.issue': 'Emitir, editar emitidas y cambiar el estado de cobro',
  'invoices.delete': 'Eliminar borradores',
  'invoices.sign': 'Registrar la firma del Cliente Final',
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
export function roleCan(role: UserRole | undefined | null, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

export type SessionUser = { id: string; username: string; displayName: string; role: UserRole; mustChangePassword: boolean; twoFactorEnabled: boolean };
export type WorkspaceUser = SessionUser & { active: boolean; createdAt: string; updatedAt: string; lastLoginAt: string; passwordChangedAt: string; recoveryCodesLeft: number };
/** Sesión abierta de la propia cuenta («Mis sesiones»). El id es un prefijo de la huella: nunca el token. */
export type OwnSession = { id: string; current: boolean; createdAt: string; lastSeenAt: string; expiresAt: string; ip: string; userAgent: string };
export type TwoFactorSetup = { secret: string; otpauthUri: string; qrSvg: string };
export type BackupInfo = { name: string; size: number; createdAt: string; encrypted: boolean };
export type BackupStatus = { enabled: boolean; encrypted: boolean; keep: number; hour: number; directory: string; backups: BackupInfo[]; lastBackupAt: string };
export type SecurityEvent = { id: number; type: string; occurredAt: string; actorName: string; targetName: string; ip: string; details: Record<string, unknown> };
export type SessionInfo = {
  protected: boolean;
  authenticated: boolean;
  demo: boolean;
  user: SessionUser | null;
  permissions: Permission[];
  /** true cuando no hay cuentas y el servidor permite crear el primer administrador desde la interfaz. */
  setupAvailable: boolean;
  /** Minutos de inactividad tras los que el servidor cierra la sesión (0 si no aplica). */
  idleMinutes?: number;
  /** Segundos que faltan para el cierre por inactividad según el servidor (lo que cuenta es la última actividad registrada). */
  idleRemainingSeconds?: number;
  /** Motivo por el que la sesión anterior terminó: inactividad o duración máxima. */
  expiredReason?: 'idle' | 'max';
  /** La política exige que esta cuenta active la verificación en dos pasos antes de continuar. */
  twoFactorSetupRequired?: boolean;
};
/** Respuesta de /api/login cuando la contraseña es correcta pero falta el segundo paso. */
export type TwoFactorChallenge = { twoFactorRequired: true; challenge: string; displayName: string };

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;
