import type { PaperSizeId, PaperOrientation } from './paperStandards';

export const OFFICIAL_PRIMARY_ACTIVITY =
  'Diseño, desarrollo e implementación de aplicaciones informáticas multiplataforma (web, móviles y de escritorio), incluyendo el análisis de requerimientos, la programación, las pruebas y el despliegue de soluciones de software a medida.';

export const OFFICIAL_SECONDARY_ACTIVITY =
  'Servicios de soporte técnico y mantenimiento de sistemas informáticos, que comprenden: diagnóstico y reparación de hardware y software; instalación, configuración y actualización de sistemas operativos, aplicaciones y controladores; montaje y mantenimiento de equipos de cómputo, periféricos y servidores; así como la recuperación de datos y la asistencia técnica remota y presencial a usuarios.';

export type ActivityType = 'principal' | 'secundaria';
export type ActivityScope = 'principal' | 'secundaria' | 'ambas';

export interface CurrencyDefinition {
  code: string;
  symbol: string;
  name: string;
}

export const SUPPORTED_CURRENCIES: CurrencyDefinition[] = [
  { code: 'USD', symbol: '$', name: 'Dólar Estadounidense (USD)' },
  { code: 'EUR', symbol: '€', name: 'Euro (EUR)' },
  { code: 'CUP', symbol: '$', name: 'Peso Cubano (CUP)' },
  { code: 'MXN', symbol: '$', name: 'Peso Mexicano (MXN)' },
  { code: 'COP', symbol: '$', name: 'Peso Colombiano (COP)' },
  { code: 'DOP', symbol: 'RD$', name: 'Peso Dominicano (DOP)' },
  { code: 'PEN', symbol: 'S/', name: 'Sol Peruano (PEN)' },
  { code: 'ARS', symbol: '$', name: 'Peso Argentino (ARS)' },
  { code: 'CLP', symbol: '$', name: 'Peso Chileno (CLP)' },
];

export interface SupplierProfile {
  id: number;
  businessName: string;
  ownerName: string;
  ownerRole: string;
  taxId: string;
  registryNumber: string;
  primaryActivity: string;
  secondaryActivity: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  website: string;
  bankName: string;
  bankAccount: string;
  bankSecondaryAccount: string;
  bankHolder: string;
  defaultCurrency: string;
  defaultTaxName: string;
  defaultTaxRate: number;
  invoicePrefix: string;
  nextInvoiceSequence: number;
  defaultPaperSize: PaperSizeId;
  defaultWarrantyTerms: string;
  supplierSignatureDataUrl: string;
  updatedAt: string;
}

export type ClientType =
  | 'Empresa / Entidad Jurídica'
  | 'MIPYME / Negocio Privado'
  | 'Institución / Organismo'
  | 'Persona Natural';

export interface Client {
  id: string;
  code: string;
  name: string;
  clientType: ClientType;
  taxId: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  representativeName: string;
  representativeId: string;
  representativeRole: string;
  notes: string;
  createdAt: string;
}

export type ContractStatus = 'vigente' | 'en_ejecucion' | 'finalizado' | 'borrador';

export interface Contract {
  id: string;
  contractNumber: string;
  clientId: string;
  clientName?: string;
  title: string;
  activityScope: ActivityScope;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  currency: string;
  contractValue: number;
  paymentTerms: string;
  deliveryModality: string;
  warrantyDaysSoftware: number;
  warrantyDaysSupport: number;
  clausesSummary: string;
  acceptanceClause: string;
  createdAt: string;
}

export interface ServiceCatalogItem {
  id: string;
  code: string;
  activityType: ActivityType;
  category: string;
  name: string;
  description: string;
  unit: string;
  basePrice: number;
  isInstallationService: boolean;
}

/* ============================================================================
 * PERFECCIONAMIENTO DEL APARTADO DE INSTALACIÓN:
 * SISTEMAS OPERATIVOS (SO), PROGRAMAS / APLICACIONES Y CONTROLADORES (DRIVERS)
 * ============================================================================ */

export type OSFamily =
  | 'Windows Desktop'
  | 'Windows Server'
  | 'GNU/Linux Escritorio'
  | 'GNU/Linux Servidor'
  | 'Apple macOS'
  | 'Virtualización / Especializado'
  | 'Móvil / Embebido';

export interface OperatingSystemItem {
  id: string;
  family: OSFamily;
  name: string;
  editionVersion: string;
  architecture: '64-bit (x64)' | 'ARM64' | '32-bit (x86)' | 'Multi-arquitectura';
  installType:
    | 'Instalación Limpia (Formateo + Optimización)'
    | 'Actualización Conservando Datos y Perfil'
    | 'Dual-Boot / Multi-Sistema'
    | 'Despliegue en Servidor / Máquina Virtual'
    | 'Reparación de Arranque y Sistema';
  partitionScheme: 'UEFI / GPT' | 'BIOS Legacy / MBR' | 'LVM / RAID / ZFS' | 'APFS' | 'Gestionado por el fabricante (Móvil / Embebido)';
  licenseType:
    | 'Licencia OEM del Equipo'
    | 'Licencia Digital / Volumen del Cliente'
    | 'Software Libre / Open Source (GPL)'
    | 'Suministrada según Contrato'
    | 'Evaluación / Pendiente Activación Cliente';
  updatesApplied: boolean;
  notes: string;
  price: number;
}

export type ProgramCategory =
  | 'Ofimática y Productividad'
  | 'Utilidades, Compresión y Navegadores'
  | 'Seguridad, Antivirus y Respaldo'
  | 'Diseño Gráfico, CAD y Multimedia'
  | 'Desarrollo, Bases de Datos y Servidores'
  | 'Contable, Empresarial y Software a Medida';

export interface SoftwareProgramItem {
  id: string;
  category: ProgramCategory;
  name: string;
  version: string;
  licenseType:
    | 'Software Libre / Gratuito'
    | 'Licencia del Cliente'
    | 'Suscripción Corporativa'
    | 'Software a Medida del Suministrador'
    | 'Suministrada según Contrato';
  configurationNotes: string;
  price: number;
}

export type DriverSubsystem =
  | 'Chipset, Placa Base y BIOS/UEFI'
  | 'Video y Aceleración Gráfica (GPU)'
  | 'Almacenamiento NVMe / SATA / Controladora RAID'
  | 'Red Ethernet LAN, Wi-Fi y Bluetooth'
  | 'Audio de Alta Definición y Multimedia'
  | 'Impresoras, Escáneres y Periféricos POS'
  | 'Energía ACPI, Touchpad y Seguridad Biométrica';

export interface DriverItem {
  id: string;
  subsystem: DriverSubsystem;
  deviceName: string;
  manufacturer: string;
  driverVersion: string;
  sourceType:
    | 'Fabricante Oficial OEM'
    | 'Certificado WHQL'
    | 'Módulo Oficial Kernel / DKMS'
    | 'Controlador Universal PCL6 / PostScript / TWAIN';
  verified: boolean;
  notes: string;
  price: number;
}

export interface EquipmentVerificationChecks {
  bootAndPerformanceOk: boolean;
  deviceManagerClean: boolean;
  networkAndPeripheralsOk: boolean;
  dataIntegrityVerified: boolean;
  technicalObservations: string;
}

export interface EquipmentInstallationBlock {
  id: string;
  equipmentType:
    | 'Laptop / Portátil'
    | 'PC de Escritorio / Workstation'
    | 'Servidor Físico / Rack'
    | 'Servidor Virtual / VPS / Cloud'
    | 'All-in-One (Todo en Uno)'
    | 'Terminal POS / Periférico Especializado'
    | 'Dispositivo Móvil / Tablet';
  brandModel: string;
  serialNumber: string;
  assetCode: string;
  hardwareSpecs: string;
  serviceModality: 'Presencial' | 'Remota' | 'Taller del Suministrador';
  backupPerformed: boolean;
  backupDetails: string;
  operatingSystems: OperatingSystemItem[];
  programs: SoftwareProgramItem[];
  drivers: DriverItem[];
  verification: EquipmentVerificationChecks;
}

export interface InvoiceLineItem {
  id: string;
  code: string;
  activityType: ActivityType;
  category: string;
  title: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
}

export type InvoiceStatus = 'borrador' | 'emitida' | 'pagada' | 'vencida' | 'anulada';
export type SignatureStatus = 'pendiente_firma' | 'firmada_cliente';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  signatureStatus: SignatureStatus;
  clientId: string;
  contractId: string;
  activityScope: ActivityScope;
  currency: string;
  items: InvoiceLineItem[];
  installationBlocks: EquipmentInstallationBlock[];
  subtotal: number;
  discountTotal: number;
  taxName: string;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: string;
  serviceModality: string;
  serviceLocation: string;
  warrantyNotes: string;
  notes: string;
  acceptanceStatement: string;
  clientSignerName: string;
  clientSignerId: string;
  clientSignerRole: string;
  clientSignedAt: string;
  clientSignatureDataUrl: string;
  supplierSignatureDataUrl: string;
  preferredPaperSize: PaperSizeId;
  preferredOrientation: PaperOrientation;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
  signatureDocumentHash?: string;
  // Hydrated relations for views & exports
  client?: Client;
  contract?: Contract | null;
  supplier?: SupplierProfile;
}

export interface DashboardStats {
  totalInvoices: number;
  totalRevenueByCurrency: Record<string, number>;
  paidAmountByCurrency: Record<string, number>;
  pendingAmountByCurrency: Record<string, number>;
  primaryActivityRevenue: Record<string, number>;
  secondaryActivityRevenue: Record<string, number>;
  signedInvoicesCount: number;
  pendingSignatureCount: number;
  activeContractsCount: number;
  totalClientsCount: number;
  totalEquipmentsIntervened: number;
}
