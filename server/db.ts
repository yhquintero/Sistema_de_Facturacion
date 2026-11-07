import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { calculateInvoiceTotals, roundMoney } from '../shared/invoiceMath';
import { clientSchema, contractSchema, invoiceInputSchema, invoiceStatusSchema, serviceSchema, signatureSchema, supplierSchema, validate } from './validation';
import fs from 'node:fs';
import path from 'node:path';
import {
  OFFICIAL_PRIMARY_ACTIVITY,
  OFFICIAL_SECONDARY_ACTIVITY,
  type SupplierProfile,
  type Client,
  type Contract,
  type ServiceCatalogItem,
  type Invoice,
  type DashboardStats,
} from '../shared/types';
import { DEFAULT_SERVICE_CATALOG } from '../shared/catalogPresets';
import { assertValidSignature, createSampleSignatureDataUrl } from './utils/signaturePng';
import { currentActor } from './actor';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

if (process.platform !== 'win32') { fs.chmodSync(DATA_DIR, 0o700); process.umask(0o077); }
const DB_PATH = path.join(DATA_DIR, 'facturacion.sqlite');
export const db = new DatabaseSync(DB_PATH);
fs.chmodSync(DB_PATH, 0o600);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');

function initSchemaAndSeed() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      registry_number TEXT NOT NULL,
      primary_activity TEXT NOT NULL,
      secondary_activity TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      website TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      bank_account TEXT NOT NULL,
      bank_secondary_account TEXT NOT NULL,
      bank_holder TEXT NOT NULL,
      default_currency TEXT NOT NULL,
      default_tax_name TEXT NOT NULL,
      default_tax_rate REAL NOT NULL,
      invoice_prefix TEXT NOT NULL,
      next_invoice_sequence INTEGER NOT NULL,
      default_paper_size TEXT NOT NULL,
      default_warranty_terms TEXT NOT NULL,
      supplier_signature_data_url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      client_type TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      representative_name TEXT NOT NULL,
      representative_id TEXT NOT NULL,
      representative_role TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      contract_number TEXT NOT NULL,
      client_id TEXT NOT NULL,
      title TEXT NOT NULL,
      activity_scope TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL,
      currency TEXT NOT NULL,
      contract_value REAL NOT NULL,
      payment_terms TEXT NOT NULL,
      delivery_modality TEXT NOT NULL,
      warranty_days_software INTEGER NOT NULL,
      warranty_days_support INTEGER NOT NULL,
      clauses_summary TEXT NOT NULL,
      acceptance_clause TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS service_catalog (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      base_price REAL NOT NULL,
      is_installation_service INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL,
      signature_status TEXT NOT NULL,
      client_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      activity_scope TEXT NOT NULL,
      currency TEXT NOT NULL,
      items_json TEXT NOT NULL,
      installation_blocks_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount_total REAL NOT NULL,
      tax_name TEXT NOT NULL,
      tax_rate REAL NOT NULL,
      tax_amount REAL NOT NULL,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      service_modality TEXT NOT NULL,
      service_location TEXT NOT NULL,
      warranty_notes TEXT NOT NULL,
      notes TEXT NOT NULL,
      acceptance_statement TEXT NOT NULL,
      client_signer_name TEXT NOT NULL,
      client_signer_id TEXT NOT NULL,
      client_signer_role TEXT NOT NULL,
      client_signed_at TEXT NOT NULL,
      client_signature_data_url TEXT NOT NULL,
      supplier_signature_data_url TEXT NOT NULL,
      preferred_paper_size TEXT NOT NULL,
      preferred_orientation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
    );
  `);

  const supplierRow = db.prepare('SELECT COUNT(*) as c FROM supplier_profile').get() as { c: number };
  if (supplierRow.c === 0) {
    const seedDemo = process.env.SEED_DEMO === 'true' || (process.env.SEED_DEMO !== 'false' && process.env.NODE_ENV !== 'production' && !process.argv.includes('--production'));
    if (!seedDemo) {
      const profile: SupplierProfile = { id: 1, businessName: 'Mi negocio', ownerName: 'El Suministrador', ownerRole: '', taxId: '', registryNumber: '', primaryActivity: OFFICIAL_PRIMARY_ACTIVITY, secondaryActivity: OFFICIAL_SECONDARY_ACTIVITY, email: '', phone: '', address: '', city: '', country: '', website: '', bankName: '', bankAccount: '', bankSecondaryAccount: '', bankHolder: '', defaultCurrency: 'USD', defaultTaxName: 'Impuesto', defaultTaxRate: 0, invoicePrefix: `FAC-${new Date().getFullYear()}-`, nextInvoiceSequence: 1, defaultPaperSize: 'A4', defaultWarrantyTerms: 'Según el contrato suscrito entre el Suministrador y el Cliente.', supplierSignatureDataUrl: '', updatedAt: new Date().toISOString() };
      persist('supplier_profile', snakeRow(profile));
      for (const item of DEFAULT_SERVICE_CATALOG) persist('service_catalog', snakeRow(item));
      return;
    }
    const supplierSig = createSampleSignatureDataUrl('supplier');
    const clientSig = createSampleSignatureDataUrl('client');
    const nowIso = '2026-11-05T10:00:00.000Z';

    db.prepare(`
      INSERT INTO supplier_profile (
        id, business_name, owner_name, owner_role, tax_id, registry_number,
        primary_activity, secondary_activity, email, phone, address, city, country, website,
        bank_name, bank_account, bank_secondary_account, bank_holder,
        default_currency, default_tax_name, default_tax_rate,
        invoice_prefix, next_invoice_sequence, default_paper_size,
        default_warranty_terms, supplier_signature_data_url, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      'Soluciones Informáticas & Ingeniería de Software — EL SUMINISTRADOR',
      'Ing. Y. H. Quintero (Titular — El Suministrador)',
      'Titular / Desarrollador Multiplataforma y Especialista en Soporte TI',
      'NIT-900845210-7',
      'REG-TI-2026-0418',
      OFFICIAL_PRIMARY_ACTIVITY,
      OFFICIAL_SECONDARY_ACTIVITY,
      'contacto@suministrador-ti.com',
      '+1 (555) 234-8910 / +53 5 555-0192',
      'Av. Tecnológica Nº 410, Ofic. 302, Distrito Empresarial',
      'Centro Empresarial',
      'Internacional',
      'https://suministrador-ti.com',
      'Banco Comercial Empresarial',
      '9200-4418-7732-0019 (Cuenta Fiscal Principal)',
      '9200-4418-8890-0045 (Cuenta Multimoneda USD/EUR)',
      'Y. H. Quintero — Servicios Informáticos',
      'USD',
      'Impuesto s/ Servicios',
      10,
      'FAC-2026-',
      4,
      'A4',
      'Garantía de 180 días sobre desarrollo de software a medida (corrección de defectos sobre requerimientos aprobados) y 30 días sobre instalación, configuración de sistemas operativos, aplicaciones y controladores, salvo manipulación externa o daños eléctricos.',
      supplierSig,
      nowIso
    );

    // Seed Catalog
    const insertCat = db.prepare(`
      INSERT INTO service_catalog (id, code, activity_type, category, name, description, unit, base_price, is_installation_service)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of DEFAULT_SERVICE_CATALOG) {
      insertCat.run(
        item.id,
        item.code,
        item.activityType,
        item.category,
        item.name,
        item.description,
        item.unit,
        item.basePrice,
        item.isInstallationService ? 1 : 0
      );
    }

    // Seed Clients
    const clientsSeed: Client[] = [
      {
        id: 'cli-01',
        code: 'CLI-001',
        name: 'Grupo Comercial & Logístico Atlántico S.R.L.',
        clientType: 'MIPYME / Negocio Privado',
        taxId: 'NIT-500319842-1',
        address: 'Calle 42 Nº 1805 e/ Av. Central y Paseo Industrial',
        city: 'Zona Corporativa',
        phone: '+1 (555) 819-4401',
        email: 'administracion@grupoatlantico.com',
        representativeName: 'Lic. Roberto Méndez Valdés',
        representativeId: 'ID-79041522819',
        representativeRole: 'Director de Operaciones y Contratación',
        notes: 'Cliente corporativo con contrato anual de desarrollo multiplataforma y mantenimiento integral de parque informático.',
        createdAt: '2026-09-10T09:00:00.000Z',
      },
      {
        id: 'cli-02',
        code: 'CLI-002',
        name: 'Estudio de Arquitectura e Ingeniería Prisma',
        clientType: 'Empresa / Entidad Jurídica',
        taxId: 'NIT-610948271-4',
        address: 'Torre Prisma Piso 5, Bulevar de las Ciencias 220',
        city: 'Distrito Financiero',
        phone: '+1 (555) 390-7712',
        email: 'gerencia@arquitecturaprisma.com',
        representativeName: 'Arq. Elena Castellanos Ruiz',
        representativeId: 'ID-84110234910',
        representativeRole: 'Socia Directora',
        notes: 'Estaciones de trabajo CAD/BIM de alto rendimiento, servidores NAS y soporte presencial/remoto.',
        createdAt: '2026-09-22T14:30:00.000Z',
      },
      {
        id: 'cli-03',
        code: 'CLI-003',
        name: 'Distribuidora Médica BioSalud Integral S.A.',
        clientType: 'Empresa / Entidad Jurídica',
        taxId: 'NIT-740291834-9',
        address: 'Parque Científico Empresarial Nave B-12',
        city: 'Parque Industrial',
        phone: '+1 (555) 602-1198',
        email: 'ti@biosaludintegral.com',
        representativeName: 'Ing. Marcos Delgado Pérez',
        representativeId: 'ID-81062344102',
        representativeRole: 'Jefe de Infraestructura y Sistemas',
        notes: 'Implementación de plataforma web/móvil de pedidos y servidores Linux en alta disponibilidad.',
        createdAt: '2026-10-03T11:15:00.000Z',
      },
    ];

    const insertClient = db.prepare(`
      INSERT INTO clients (
        id, code, name, client_type, tax_id, address, city, phone, email,
        representative_name, representative_id, representative_role, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of clientsSeed) {
      insertClient.run(
        c.id,
        c.code,
        c.name,
        c.clientType,
        c.taxId,
        c.address,
        c.city,
        c.phone,
        c.email,
        c.representativeName,
        c.representativeId,
        c.representativeRole,
        c.notes,
        c.createdAt
      );
    }

    // Seed Contracts (Elaborados entre EL SUMINISTRADOR y EL CLIENTE)
    const contractsSeed: Contract[] = [
      {
        id: 'ctr-01',
        contractNumber: 'CTR-2026-001',
        clientId: 'cli-01',
        title: 'Contrato Marco de Desarrollo de Software a Medida y Soporte Técnico Integral de Infraestructura TI',
        activityScope: 'ambas',
        startDate: '2026-01-15',
        endDate: '2026-12-31',
        status: 'vigente',
        currency: 'USD',
        contractValue: 8500,
        paymentTerms: 'Transferencia bancaria dentro de los 15 días naturales posteriores a la firma de conformidad de la Factura.',
        deliveryModality: 'Híbrida (Presencial en sede del Cliente y Asistencia Remota)',
        warrantyDaysSoftware: 180,
        warrantyDaysSupport: 30,
        clausesSummary:
          'CLÁUSULA PRIMERA (OBJETO): EL SUMINISTRADOR ejecuta para EL CLIENTE servicios de diseño, desarrollo e implementación de aplicaciones multiplataforma (Actividad Principal) y servicios de soporte técnico, mantenimiento e instalación de sistemas operativos, aplicaciones y controladores (Actividad Secundaria). CLÁUSULA CUARTA (ENTREGA Y FACTURACIÓN): Cada entrega o intervención técnica se documentará en Factura desglosada que surtirá efectos de Acta de Recepción y Conformidad tras la firma del representante autorizado de EL CLIENTE.',
        acceptanceClause:
          'De acuerdo con el Contrato Nº CTR-2026-001 suscrito entre EL SUMINISTRADOR y EL CLIENTE, el Cliente Final certifica con su firma haber verificado y recibido a entera satisfacción los módulos de software, equipos, sistemas operativos, programas y controladores (drivers) detallados en la presente Factura.',
        createdAt: '2026-01-15T10:00:00.000Z',
      },
      {
        id: 'ctr-02',
        contractNumber: 'CTR-2026-002',
        clientId: 'cli-02',
        title: 'Contrato de Servicios Técnicos Especializados: Instalación de Workstations CAD, Sistemas Operativos, Suites y Drivers',
        activityScope: 'secundaria',
        startDate: '2026-03-01',
        endDate: '2027-02-28',
        status: 'vigente',
        currency: 'USD',
        contractValue: 3200,
        paymentTerms: 'Pago al contado / transferencia en un plazo máximo de 7 días hábiles tras recepción firmada.',
        deliveryModality: 'Presencial en sede del Cliente',
        warrantyDaysSoftware: 0,
        warrantyDaysSupport: 45,
        clausesSummary:
          'Contrato específico amparado en la Actividad Secundaria de EL SUMINISTRADOR para diagnóstico, montaje, mantenimiento preventivo/correctivo, recuperación de datos e instalación certificada de sistemas operativos, suites gráficas/CAD y controladores WHQL en estaciones de trabajo y periféricos.',
        acceptanceClause:
          'En cumplimiento del Contrato Nº CTR-2026-002 entre EL SUMINISTRADOR y EL CLIENTE, el Cliente Final hace constar que cada equipo relacionado arranca sin errores, con todos sus Sistemas Operativos, Programas y Drivers verificados y operativos.',
        createdAt: '2026-03-01T09:00:00.000Z',
      },
      {
        id: 'ctr-03',
        contractNumber: 'CTR-2026-003',
        clientId: 'cli-03',
        title: 'Contrato de Desarrollo e Implementación de Plataforma Multiplataforma (Web, Servidor API y App Móvil)',
        activityScope: 'principal',
        startDate: '2026-06-01',
        endDate: '2026-12-31',
        status: 'en_ejecucion',
        currency: 'USD',
        contractValue: 6400,
        paymentTerms: 'Facturación por hitos entregados y validados; pago a 10 días naturales.',
        deliveryModality: 'Despliegue en Servidor + Validación Presencial',
        warrantyDaysSoftware: 180,
        warrantyDaysSupport: 60,
        clausesSummary:
          'Contrato de ingeniería de software a medida (Actividad Principal): análisis de requerimientos, diseño UI/UX, programación web, móvil y escritorio, ejecución de pruebas QA integrales y puesta en producción.',
        acceptanceClause:
          'Conforme al Contrato Nº CTR-2026-003 celebrado entre EL SUMINISTRADOR y EL CLIENTE, la firma del Cliente Final acredita la superación de las pruebas funcionales y la recepción conforme del entregable de software.',
        createdAt: '2026-06-01T11:00:00.000Z',
      },
    ];

    const insertContract = db.prepare(`
      INSERT INTO contracts (
        id, contract_number, client_id, title, activity_scope, start_date, end_date,
        status, currency, contract_value, payment_terms, delivery_modality,
        warranty_days_software, warranty_days_support, clauses_summary, acceptance_clause, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ct of contractsSeed) {
      insertContract.run(
        ct.id,
        ct.contractNumber,
        ct.clientId,
        ct.title,
        ct.activityScope,
        ct.startDate,
        ct.endDate,
        ct.status,
        ct.currency,
        ct.contractValue,
        ct.paymentTerms,
        ct.deliveryModality,
        ct.warrantyDaysSoftware,
        ct.warrantyDaysSupport,
        ct.clausesSummary,
        ct.acceptanceClause,
        ct.createdAt
      );
    }

    // Seed Demo Invoices
    const insertInvoice = db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, issue_date, due_date, status, signature_status,
        client_id, contract_id, activity_scope, currency,
        items_json, installation_blocks_json,
        subtotal, discount_total, tax_name, tax_rate, tax_amount, total,
        payment_method, service_modality, service_location, warranty_notes, notes,
        acceptance_statement, client_signer_name, client_signer_id, client_signer_role,
        client_signed_at, client_signature_data_url, supplier_signature_data_url,
        preferred_paper_size, preferred_orientation, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    // Factura 1: Mixta (Actividad Principal + Actividad Secundaria con Desglose Completo de Instalación SO/Programas/Drivers) — Lista para firma del Cliente Final
    const inv1Items = [
      {
        id: 'li-101',
        code: 'DEV-WEB-02',
        activityType: 'principal',
        category: 'Desarrollo Web y Móvil a Medida',
        title: 'Desarrollo e Implementación de Módulo Web + PWA Móvil de Control de Almacén y Despacho',
        description:
          'Incluye análisis de requerimientos, programación de interfaz web responsiva, API REST en servidor, módulo móvil de escaneo y pruebas integrales QA.',
        unit: 'Módulo',
        quantity: 1,
        unitPrice: 950,
        discountPercent: 0,
        lineTotal: 950,
      },
      {
        id: 'li-102',
        code: 'DEV-DEP-06',
        activityType: 'principal',
        category: 'Despliegue y Puesta en Producción',
        title: 'Despliegue Productivo en Servidor Central, Configuración HTTPS y Respaldo Automatizado',
        description:
          'Puesta en marcha de la solución multiplataforma en infraestructura del cliente, proxy inverso TLS y capacitación a operadores.',
        unit: 'Despliegue',
        quantity: 1,
        unitPrice: 250,
        discountPercent: 0,
        lineTotal: 250,
      },
      {
        id: 'li-103',
        code: 'SUP-SRV-02',
        activityType: 'secundaria',
        category: 'Instalación de SO, Programas y Drivers (Servidor)',
        title: 'Instalación y Configuración de Servidor Linux de Producción, Servicios y Controladora RAID',
        description:
          'Aprovisionamiento de servidor Dell PowerEdge T350 según desglose técnico adjunto de Sistema Operativo, paquetes de servidor y drivers empresariales.',
        unit: 'Servidor',
        quantity: 1,
        unitPrice: 180,
        discountPercent: 0,
        lineTotal: 180,
      },
      {
        id: 'li-104',
        code: 'SUP-INS-01',
        activityType: 'secundaria',
        category: 'Instalación de SO, Programas y Drivers (Estaciones)',
        title: 'Instalación, Configuración y Actualización de SO Windows 11 Pro, Programas Corporativos y Drivers',
        description:
          'Intervención completa en estaciones portátiles administrativas Dell Latitude 5540 según anexo detallado de SO, aplicaciones y controladores.',
        unit: 'Equipo',
        quantity: 2,
        unitPrice: 65,
        discountPercent: 0,
        lineTotal: 130,
      },
    ];

    const inv1InstallBlocks = [
      {
        id: 'eq-101',
        equipmentType: 'Servidor Físico / Rack',
        brandModel: 'Dell PowerEdge T350 Tower Server',
        serialNumber: 'SN-PE350-99481A',
        assetCode: 'ACT-SRV-001',
        hardwareSpecs: 'Intel Xeon E-2336 6C/12T, 32 GB ECC DDR4, 2× 1TB Enterprise NVMe RAID-1, Dual GbE',
        serviceModality: 'Presencial',
        backupPerformed: true,
        backupDetails: 'Respaldo íntegro previo de configuraciones de red y base de datos histórica en NAS externo.',
        operatingSystems: [
          {
            id: 'os-101',
            family: 'GNU/Linux Servidor',
            name: 'Ubuntu Server LTS',
            editionVersion: '24.04.1 LTS (Noble Numbat)',
            architecture: '64-bit (x64)',
            installType: 'Despliegue en Servidor / Máquina Virtual',
            partitionScheme: 'LVM / RAID / ZFS',
            licenseType: 'Software Libre / Open Source (GPL)',
            updatesApplied: true,
            notes: 'Arreglo espejo RAID-1 verificado, OpenSSH con autenticación por clave, firewall UFW activo.',
            price: 0,
          },
        ],
        programs: [
          {
            id: 'prg-101',
            category: 'Desarrollo, Bases de Datos y Servidores',
            name: 'PostgreSQL 16 + Nginx Reverse Proxy + Node.js 22 LTS + PM2/Systemd',
            version: 'Stack LTS 2026',
            licenseType: 'Software Libre / Gratuito',
            configurationNotes: 'Ajuste de memoria shared_buffers, certificados SSL internos y cron diario de backup.',
            price: 0,
          },
          {
            id: 'prg-102',
            category: 'Seguridad, Antivirus y Respaldo',
            name: 'Fail2Ban + BorgBackup Cifrado + Monitoreo S.M.A.R.T. (smartmontools)',
            version: '1.1 / 1.4',
            licenseType: 'Software Libre / Gratuito',
            configurationNotes: 'Alertas automáticas de salud de discos y copias cifradas.',
            price: 0,
          },
        ],
        drivers: [
          {
            id: 'drv-101',
            subsystem: 'Almacenamiento NVMe / SATA / Controladora RAID',
            deviceName: 'Dell PERC H355 Hardware RAID Controller Driver & Firmware',
            manufacturer: 'Dell Technologies / Broadcom',
            driverVersion: '52.26.0-5179 Oficial',
            sourceType: 'Fabricante Oficial OEM',
            verified: true,
            notes: 'Volumen lógico RAID-1 Optimal, caché y sensores térmicos verificados.',
            price: 0,
          },
          {
            id: 'drv-102',
            subsystem: 'Red Ethernet LAN, Wi-Fi y Bluetooth',
            deviceName: 'Broadcom NetXtreme Dual-Port Gigabit Ethernet (tg3 / bnxt_en)',
            manufacturer: 'Broadcom / Dell OEM',
            driverVersion: 'Kernel LTS + Firmware linux-firmware',
            sourceType: 'Módulo Oficial Kernel / DKMS',
            verified: true,
            notes: 'Bonding activo-pasivo configurado a 1000 Mbps Full Duplex.',
            price: 0,
          },
        ],
        verification: {
          bootAndPerformanceOk: true,
          deviceManagerClean: true,
          networkAndPeripheralsOk: true,
          dataIntegrityVerified: true,
          technicalObservations: 'Servidor operando con carga nominal <5%, respuesta de API <15ms en red local.',
        },
      },
      {
        id: 'eq-102',
        equipmentType: 'Laptop / Portátil',
        brandModel: 'Dell Latitude 5540 (Lote 2 Unidades: Gerencia y Almacén)',
        serialNumber: 'SN-DL5540-7721B / SN-DL5540-7722C',
        assetCode: 'ACT-LAP-014 / 015',
        hardwareSpecs: 'Intel Core i7-1355U, 16 GB DDR4, 512 GB NVMe PCIe 4.0, Pantalla 15.6" FHD',
        serviceModality: 'Presencial',
        backupPerformed: true,
        backupDetails: 'Migración verificada de documentos contables, certificados y perfiles de correo (48 GB).',
        operatingSystems: [
          {
            id: 'os-102',
            family: 'Windows Desktop',
            name: 'Microsoft Windows 11 Pro',
            editionVersion: '24H2 (Build 26100)',
            architecture: '64-bit (x64)',
            installType: 'Instalación Limpia (Formateo + Optimización)',
            partitionScheme: 'UEFI / GPT',
            licenseType: 'Licencia OEM del Equipo',
            updatesApplied: true,
            notes: 'Activación digital OEM en placa base, BitLocker respaldado y Windows Update al día.',
            price: 0,
          },
        ],
        programs: [
          {
            id: 'prg-103',
            category: 'Ofimática y Productividad',
            name: 'Microsoft Office LTSC Professional Plus 2024 + Adobe Acrobat Reader',
            version: '2024 v2408 x64',
            licenseType: 'Licencia del Cliente',
            configurationNotes: 'Word, Excel, PowerPoint y Outlook configurados con cuentas corporativas.',
            price: 0,
          },
          {
            id: 'prg-104',
            category: 'Utilidades, Compresión y Navegadores',
            name: 'Google Chrome Enterprise + Mozilla Firefox + 7-Zip + VLC + RustDesk',
            version: 'Pack Estable 2026',
            licenseType: 'Software Libre / Gratuito',
            configurationNotes: 'Acceso directo PWA al nuevo Sistema de Almacén fijado en escritorio y barra.',
            price: 0,
          },
          {
            id: 'prg-105',
            category: 'Seguridad, Antivirus y Respaldo',
            name: 'ESET Endpoint Antivirus Corporativo',
            version: '11.1.2039',
            licenseType: 'Suscripción Corporativa',
            configurationNotes: 'Políticas de escaneo USB y protección web activadas.',
            price: 0,
          },
        ],
        drivers: [
          {
            id: 'drv-103',
            subsystem: 'Chipset, Placa Base y BIOS/UEFI',
            deviceName: 'Intel Chipset Software + Management Engine + Actualización BIOS Dell v1.17',
            manufacturer: 'Intel / Dell Inc.',
            driverVersion: '10.1.19899 WHQL',
            sourceType: 'Fabricante Oficial OEM',
            verified: true,
            notes: 'Gestión térmica Dell Optimizer y puertos Thunderbolt 4 operativos.',
            price: 0,
          },
          {
            id: 'drv-104',
            subsystem: 'Almacenamiento NVMe / SATA / Controladora RAID',
            deviceName: 'Intel Rapid Storage Technology (IRST VMD Controller)',
            manufacturer: 'Intel Corporation',
            driverVersion: '20.1.0.1015 WHQL',
            sourceType: 'Certificado WHQL',
            verified: true,
            notes: 'Lectura secuencial NVMe verificada a 4,850 MB/s.',
            price: 0,
          },
          {
            id: 'drv-105',
            subsystem: 'Video y Aceleración Gráfica (GPU)',
            deviceName: 'Intel Iris Xe Graphics Driver',
            manufacturer: 'Intel Corporation',
            driverVersion: '32.0.101.6314 WHQL',
            sourceType: 'Certificado WHQL',
            verified: true,
            notes: 'Doble monitor HDMI 2.0 + pantalla integrada sin parpadeos.',
            price: 0,
          },
          {
            id: 'drv-106',
            subsystem: 'Red Ethernet LAN, Wi-Fi y Bluetooth',
            deviceName: 'Intel Wi-Fi 6E AX211 160MHz + Intel Ethernet I219-LM + Bluetooth 5.3',
            manufacturer: 'Intel Corporation',
            driverVersion: '23.90.0 WHQL',
            sourceType: 'Certificado WHQL',
            verified: true,
            notes: 'Conectividad Wi-Fi empresarial WPA3 y LAN Gigabit comprobadas.',
            price: 0,
          },
          {
            id: 'drv-107',
            subsystem: 'Impresoras, Escáneres y Periféricos POS',
            deviceName: 'Multifuncional HP LaserJet Pro MFP 4103fdw + Lector Código de Barras Zebra',
            manufacturer: 'HP / Zebra Technologies',
            driverVersion: 'PCL6 v8 + TWAIN Scan',
            sourceType: 'Controlador Universal PCL6 / PostScript / TWAIN',
            verified: true,
            notes: 'Impresión en red TCP/IP fija, escaneo a carpeta y lectura HID instantánea.',
            price: 0,
          },
        ],
        verification: {
          bootAndPerformanceOk: true,
          deviceManagerClean: true,
          networkAndPeripheralsOk: true,
          dataIntegrityVerified: true,
          technicalObservations: 'Administrador de dispositivos 100% libre de advertencias en ambas unidades.',
        },
      },
    ];

    insertInvoice.run(
      'inv-01',
      'FAC-2026-0001',
      '2026-11-04',
      '2026-11-19',
      'emitida',
      'pendiente_firma',
      'cli-01',
      'ctr-01',
      'ambas',
      'USD',
      JSON.stringify(inv1Items),
      JSON.stringify(inv1InstallBlocks),
      1510,
      0,
      'Impuesto s/ Servicios',
      10,
      151,
      1661,
      'Transferencia Bancaria Empresarial',
      'Presencial en sede del Cliente + Despliegue en Servidor',
      'Sede Central Grupo Comercial Atlántico S.R.L.',
      '180 días de garantía sobre módulos de software desarrollados y 30 días sobre configuración de servidor y estaciones de trabajo según Contrato CTR-2026-001.',
      'Incluye entrega de manual rápido de usuario y credenciales selladas del servidor.',
      contractsSeed[0].acceptanceClause,
      'Lic. Roberto Méndez Valdés',
      'ID-79041522819',
      'Director de Operaciones y Contratación',
      '',
      '',
      supplierSig,
      'A4',
      'portrait',
      '2026-11-04T15:00:00.000Z',
      '2026-11-04T15:00:00.000Z'
    );

    // Factura 2: Actividad Secundaria Pura (Workstations CAD — Ya firmada por el Cliente Final)
    const inv2Items = [
      {
        id: 'li-201',
        code: 'SUP-MNT-04',
        activityType: 'secundaria',
        category: 'Montaje y Mantenimiento de Equipos',
        title: 'Mantenimiento Preventivo Profundo y Optimización Térmica de Workstation CAD/BIM',
        description:
          'Desmontaje técnico, limpieza interna antiestática, cambio de compuesto térmico de alto rendimiento en CPU/GPU y pruebas de estrés.',
        unit: 'Equipo',
        quantity: 2,
        unitPrice: 55,
        discountPercent: 0,
        lineTotal: 110,
      },
      {
        id: 'li-202',
        code: 'SUP-INS-01',
        activityType: 'secundaria',
        category: 'Instalación de SO, Programas y Drivers',
        title: 'Instalación Certificada de Windows 11 Pro Workstation, Suites CAD/Diseño y Drivers NVIDIA Studio',
        description:
          'Configuración integral de 2 estaciones gráficas Lenovo ThinkStation P3 Tower conforme al desglose técnico de SO, Programas y Drivers.',
        unit: 'Equipo',
        quantity: 2,
        unitPrice: 85,
        discountPercent: 0,
        lineTotal: 170,
      },
      {
        id: 'li-203',
        code: 'SUP-REC-05',
        activityType: 'secundaria',
        category: 'Recuperación de Datos',
        title: 'Recuperación de Proyectos DWG/RVT desde Unidad SSD Secundaria con Tabla GPT Corrupta',
        description:
          'Reconstrucción lógica de partición y verificación de integridad de 142 GB de planos arquitectónicos.',
        unit: 'Servicio',
        quantity: 1,
        unitPrice: 120,
        discountPercent: 0,
        lineTotal: 120,
      },
    ];

    const inv2InstallBlocks = [
      {
        id: 'eq-201',
        equipmentType: 'PC de Escritorio / Workstation',
        brandModel: 'Lenovo ThinkStation P3 Tower (Estaciones CAD #1 y #2)',
        serialNumber: 'SN-TSP3-5510X / SN-TSP3-5511Y',
        assetCode: 'PRISMA-WS-01 / 02',
        hardwareSpecs: 'Intel Core i9-14900K, 64 GB DDR5, NVIDIA RTX 4070 SUPER 12GB, 2TB NVMe Gen4',
        serviceModality: 'Presencial',
        backupPerformed: true,
        backupDetails: 'Copia verificada de bibliotecas BIM, familias Revit y fuentes CAD en servidor Synology.',
        operatingSystems: [
          {
            id: 'os-201',
            family: 'Windows Desktop',
            name: 'Microsoft Windows 11 Pro for Workstations',
            editionVersion: '24H2 x64',
            architecture: '64-bit (x64)',
            installType: 'Instalación Limpia (Formateo + Optimización)',
            partitionScheme: 'UEFI / GPT',
            licenseType: 'Licencia OEM del Equipo',
            updatesApplied: true,
            notes: 'Plan de energía Alto Rendimiento para renderizado y ReFS/NTFS optimizado.',
            price: 0,
          },
        ],
        programs: [
          {
            id: 'prg-201',
            category: 'Diseño Gráfico, CAD y Multimedia',
            name: 'Autodesk AutoCAD 2025 + Revit 2025 + Blender 4.2 LTS',
            version: 'Edición 2025 x64',
            licenseType: 'Licencia del Cliente',
            configurationNotes: 'Aceleración por hardware GPU activada y plantillas métricas ISO configuradas.',
            price: 0,
          },
          {
            id: 'prg-202',
            category: 'Ofimática y Productividad',
            name: 'LibreOffice 24.8 + SumatraPDF + 7-Zip + Thunderbird',
            version: 'Estable 2026',
            licenseType: 'Software Libre / Gratuito',
            configurationNotes: 'Asociación de formatos técnicos y correo corporativo.',
            price: 0,
          },
        ],
        drivers: [
          {
            id: 'drv-201',
            subsystem: 'Video y Aceleración Gráfica (GPU)',
            deviceName: 'NVIDIA Studio Driver (RTX 4070 SUPER)',
            manufacturer: 'NVIDIA Corporation',
            driverVersion: '566.36 Studio WHQL',
            sourceType: 'Certificado WHQL',
            verified: true,
            notes: 'Certificación OptiX/CUDA en Blender y viewport fluido en Revit/AutoCAD.',
            price: 0,
          },
          {
            id: 'drv-202',
            subsystem: 'Impresoras, Escáneres y Periféricos POS',
            deviceName: 'Plotter Gran Formato HP DesignJet T650 36-in (HPGL2 / PDF Driver)',
            manufacturer: 'HP Inc.',
            driverVersion: '61.2408 Oficial',
            sourceType: 'Fabricante Oficial OEM',
            verified: true,
            notes: 'Perfiles de papel planos ISO A1, A2, A3 y calibración de línea verificados.',
            price: 0,
          },
        ],
        verification: {
          bootAndPerformanceOk: true,
          deviceManagerClean: true,
          networkAndPeripheralsOk: true,
          dataIntegrityVerified: true,
          technicalObservations: 'Temperaturas bajo carga sostenida reducidas en 14 °C tras mantenimiento.',
        },
      },
    ];

    insertInvoice.run(
      'inv-02',
      'FAC-2026-0002',
      '2026-10-28',
      '2026-11-06',
      'pagada',
      'firmada_cliente',
      'cli-02',
      'ctr-02',
      'secundaria',
      'USD',
      JSON.stringify(inv2Items),
      JSON.stringify(inv2InstallBlocks),
      400,
      0,
      'Impuesto s/ Servicios',
      10,
      40,
      440,
      'Transferencia Bancaria',
      'Presencial en sede del Cliente',
      'Torre Prisma Piso 5 — Sala de Proyectos',
      '45 días de garantía técnica sobre mantenimiento e instalación según Contrato CTR-2026-002.',
      'Servicio ejecutado fuera de horario de oficina sin interrupción operativa.',
      contractsSeed[1].acceptanceClause,
      'Arq. Elena Castellanos Ruiz',
      'ID-84110234910',
      'Socia Directora',
      '2026-10-28T18:20:00.000Z',
      clientSig,
      supplierSig,
      'LETTER',
      'portrait',
      '2026-10-28T17:00:00.000Z',
      '2026-10-28T18:20:00.000Z'
    );

    // Factura 3: Actividad Principal Pura (Desarrollo Multiplataforma)
    const inv3Items = [
      {
        id: 'li-301',
        code: 'DEV-REQ-01',
        activityType: 'principal',
        category: 'Análisis de Requerimientos y Arquitectura',
        title: 'Análisis de Requerimientos, Diseño UI/UX y Arquitectura de Sistema B2B de Pedidos Médicos',
        description:
          'Especificación funcional IEEE-830, modelo relacional de trazabilidad por lotes sanitarios y diseño de API segura.',
        unit: 'Módulo',
        quantity: 1,
        unitPrice: 380,
        discountPercent: 0,
        lineTotal: 380,
      },
      {
        id: 'li-302',
        code: 'DEV-MOV-03',
        activityType: 'principal',
        category: 'Desarrollo Móvil y Web Multiplataforma',
        title: 'Programación de Aplicación Móvil para Visitadores y Portal Web Administrativo (Hito 1)',
        description:
          'Catálogo offline-first, toma de pedidos en campo, panel servidor de aprobación de facturación y suite de pruebas QA.',
        unit: 'Módulo',
        quantity: 1,
        unitPrice: 1120,
        discountPercent: 5,
        lineTotal: 1064,
      },
    ];

    insertInvoice.run(
      'inv-03',
      'FAC-2026-0003',
      '2026-11-02',
      '2026-11-12',
      'emitida',
      'firmada_cliente',
      'cli-03',
      'ctr-03',
      'principal',
      'USD',
      JSON.stringify(inv3Items),
      JSON.stringify([]),
      1500,
      56,
      'Impuesto s/ Servicios',
      10,
      144.4,
      1588.4,
      'Transferencia Bancaria',
      'Despliegue en Servidor + Validación Presencial',
      'Parque Científico Empresarial Nave B-12',
      '180 días de garantía evolutiva y correctiva según Contrato CTR-2026-003.',
      'Entrega correspondiente al Hito #1 aprobado por el comité técnico del cliente.',
      contractsSeed[2].acceptanceClause,
      'Ing. Marcos Delgado Pérez',
      'ID-81062344102',
      'Jefe de Infraestructura y Sistemas',
      '2026-11-02T16:45:00.000Z',
      clientSig,
      supplierSig,
      'LEGAL',
      'portrait',
      '2026-11-02T15:30:00.000Z',
      '2026-11-02T16:45:00.000Z'
    );
  }
}

initSchemaAndSeed();

/* ============================================================================
 * REPOSITORIOS Y CONSULTAS TIPADAS
 * ============================================================================ */

// Additive migrations keep existing installations and their data intact.
const invoiceColumns = new Set((db.prepare('PRAGMA table_info(invoices)').all() as { name: string }[]).map(c => c.name));
for (const [name, definition] of Object.entries({ document_snapshot_json: "TEXT NOT NULL DEFAULT ''", document_hash: "TEXT NOT NULL DEFAULT ''", signature_consent_json: "TEXT NOT NULL DEFAULT ''", is_demo: 'INTEGER NOT NULL DEFAULT 0' })) {
  if (!invoiceColumns.has(name)) db.exec(`ALTER TABLE invoices ADD COLUMN ${name} ${definition}`);
}
db.exec(`
  CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT OR IGNORE INTO app_metadata (key,value) VALUES ('demo_mode', CASE WHEN EXISTS(SELECT 1 FROM invoices WHERE id='inv-01') THEN 'true' ELSE 'false' END);
  CREATE UNIQUE INDEX IF NOT EXISTS clients_code_unique ON clients(code);
  CREATE UNIQUE INDEX IF NOT EXISTS contracts_number_unique ON contracts(contract_number);
  CREATE UNIQUE INDEX IF NOT EXISTS catalog_code_unique ON service_catalog(code);
  CREATE INDEX IF NOT EXISTS invoices_client_index ON invoices(client_id);
  CREATE INDEX IF NOT EXISTS invoices_contract_index ON invoices(contract_id);
  CREATE TABLE IF NOT EXISTS invoice_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    details_json TEXT NOT NULL
  );
  UPDATE invoices SET is_demo = 1 WHERE id IN ('inv-01', 'inv-02', 'inv-03');
`);
const eventColumns = new Set((db.prepare('PRAGMA table_info(invoice_events)').all() as { name: string }[]).map(c => c.name));
for (const name of ['actor_id', 'actor_name']) if (!eventColumns.has(name)) db.exec(`ALTER TABLE invoice_events ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);

type Row = Record<string, SQLInputValue>;
type Table = 'supplier_profile' | 'clients' | 'contracts' | 'service_catalog' | 'invoices';
function camelRow(row: Record<string, unknown>) { return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v])); }
function snakeRow(object: object): Row { return Object.fromEntries(Object.entries(object).map(([k, v]) => [k.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), typeof v === 'boolean' ? Number(v) : v])) as Row; }
function persist(table: Table, record: Row) {
  const columns = Object.keys(record);
  db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(',')}`).run(...Object.values(record));
}
function transaction<T>(action: () => T): T { db.exec('BEGIN IMMEDIATE'); try { const result = action(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
function ensureUnique(table: Table, column: 'code' | 'contract_number' | 'invoice_number', value: string, id = '') { if (db.prepare(`SELECT id FROM ${table} WHERE ${column} = ? AND id != ?`).get(value, id)) throw new Error(`Ya existe un registro con el número o código «${value}».`); }
function audit(invoiceId: string, event: string, details: object = {}) { const actor = currentActor(); db.prepare('INSERT INTO invoice_events (invoice_id,event_type,occurred_at,details_json,actor_id,actor_name) VALUES (?,?,?,?,?,?)').run(invoiceId, event, new Date().toISOString(), JSON.stringify(details), actor.id, actor.name); }

export function getWorkspaceInfo() { return { demo: db.prepare("SELECT value FROM app_metadata WHERE key='demo_mode'").get()?.value === 'true' }; }
export function getSupplierProfile(): SupplierProfile { return camelRow(db.prepare('SELECT * FROM supplier_profile WHERE id=1').get()!) as unknown as SupplierProfile; }
export function updateSupplierProfile(input: Partial<SupplierProfile>): SupplierProfile {
  const current = getSupplierProfile();
  if (input.updatedAt && input.updatedAt !== current.updatedAt) throw new Error('El perfil del Suministrador cambió en otro dispositivo. Revisa los datos actuales antes de guardar.');
  const data = validate(supplierSchema, { ...current, ...input, primaryActivity: OFFICIAL_PRIMARY_ACTIVITY, secondaryActivity: OFFICIAL_SECONDARY_ACTIVITY });
  if (data.supplierSignatureDataUrl) assertValidSignature(data.supplierSignatureDataUrl);
  persist('supplier_profile', { ...snakeRow(data), id: 1, updated_at: new Date().toISOString() });
  return getSupplierProfile();
}
export function listClients(): Client[] { return db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all().map(r => camelRow(r) as unknown as Client); }
export function getClientById(id: string): Client | undefined { const r = db.prepare('SELECT * FROM clients WHERE id=?').get(id); return r ? camelRow(r) as unknown as Client : undefined; }
export function saveClient(input: Partial<Client>): Client {
  const existing = input.id ? getClientById(input.id) : undefined;
  if (input.id && !existing) throw new Error('Cliente no encontrado.');
  const data = validate(clientSchema, { ...existing, ...input });
  ensureUnique('clients', 'code', data.code, existing?.id);
  const id = existing?.id || `cli-${randomUUID()}`;
  persist('clients', { ...snakeRow(data), id, created_at: existing?.createdAt || new Date().toISOString() });
  return getClientById(id)!;
}
export function deleteClient(id: string): void { if (!getClientById(id)) throw new Error('Cliente no encontrado.'); db.prepare('DELETE FROM clients WHERE id=?').run(id); }

export function listContracts(): Contract[] { return db.prepare('SELECT ct.*, cl.name AS client_name FROM contracts ct JOIN clients cl ON cl.id=ct.client_id ORDER BY ct.created_at DESC').all().map(r => camelRow(r) as unknown as Contract); }
export function getContractById(id: string): Contract | undefined { const row = db.prepare('SELECT ct.*, cl.name AS client_name FROM contracts ct JOIN clients cl ON cl.id=ct.client_id WHERE ct.id=?').get(id); return row ? camelRow(row) as unknown as Contract : undefined; }
export function saveContract(input: Partial<Contract>): Contract {
  const existing = input.id ? getContractById(input.id) : undefined;
  if (input.id && !existing) throw new Error('Contrato no encontrado.');
  const data = validate(contractSchema, { ...existing, ...input });
  if (!getClientById(data.clientId)) throw new Error('El Cliente del contrato no existe.');
  if (data.endDate < data.startDate) throw new Error('La vigencia del contrato no es válida.');
  if (existing && data.clientId !== existing.clientId && db.prepare('SELECT id FROM invoices WHERE contract_id=? LIMIT 1').get(existing.id)) throw new Error('No se puede cambiar el Cliente de un contrato con facturas vinculadas.');
  ensureUnique('contracts', 'contract_number', data.contractNumber, existing?.id);
  const id = existing?.id || `ctr-${randomUUID()}`;
  persist('contracts', { ...snakeRow(data), id, created_at: existing?.createdAt || new Date().toISOString() });
  return getContractById(id)!;
}
export function deleteContract(id: string): void { if (!getContractById(id)) throw new Error('Contrato no encontrado.'); if (db.prepare('SELECT id FROM invoices WHERE contract_id=? LIMIT 1').get(id)) throw new Error('No se puede eliminar un contrato con facturas vinculadas.'); db.prepare('DELETE FROM contracts WHERE id=?').run(id); }

export function listServiceCatalog(): ServiceCatalogItem[] { return db.prepare('SELECT * FROM service_catalog ORDER BY activity_type,code').all().map(r => ({ ...camelRow(r), isInstallationService: Boolean(r.is_installation_service) }) as unknown as ServiceCatalogItem); }
export function saveServiceCatalogItem(input: Partial<ServiceCatalogItem>): ServiceCatalogItem {
  const existing = input.id ? listServiceCatalog().find(i => i.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('Servicio no encontrado.');
  const data = validate(serviceSchema, { ...existing, ...input });
  if (data.isInstallationService && data.activityType !== 'secundaria') throw new Error('La instalación pertenece a la Actividad Secundaria.');
  ensureUnique('service_catalog', 'code', data.code, existing?.id);
  const id = existing?.id || `srv-${randomUUID()}`;
  persist('service_catalog', { ...snakeRow(data), id });
  return listServiceCatalog().find(i => i.id === id)!;
}
export function deleteServiceCatalogItem(id: string): void { if (!listServiceCatalog().some(i => i.id === id)) throw new Error('Servicio no encontrado.'); db.prepare('DELETE FROM service_catalog WHERE id=?').run(id); }

type DocumentSnapshot = { supplier: SupplierProfile; client: Client; contract: Contract | null };
function hydrateInvoice(row: Record<string, unknown>): Invoice {
  const mapped = camelRow(row);
  const invoice = { ...mapped, items: JSON.parse(String(row.items_json)), installationBlocks: JSON.parse(String(row.installation_blocks_json)), isDemo: Boolean(row.is_demo), signatureDocumentHash: String(row.document_hash || '') } as unknown as Invoice;
  const snapshot: DocumentSnapshot | null = row.document_snapshot_json ? JSON.parse(String(row.document_snapshot_json)) : null;
  invoice.client = snapshot?.client || getClientById(invoice.clientId);
  invoice.contract = snapshot?.contract || (invoice.contractId ? getContractById(invoice.contractId) || null : null);
  invoice.supplier = snapshot?.supplier || getSupplierProfile();
  // Internal raw JSON and audit data are never sent to the browser twice.
  for (const field of ['itemsJson', 'installationBlocksJson', 'documentSnapshotJson', 'documentHash', 'signatureConsentJson']) delete (invoice as unknown as Record<string, unknown>)[field];
  return invoice;
}
export function listInvoices(): Invoice[] { return db.prepare('SELECT * FROM invoices ORDER BY issue_date DESC,created_at DESC').all().map(hydrateInvoice); }
export function getInvoiceById(id: string): Invoice | undefined { const row = db.prepare('SELECT * FROM invoices WHERE id=?').get(id); return row ? hydrateInvoice(row) : undefined; }

function assertInvoiceDocument(invoice: Invoice) {
  const client = getClientById(invoice.clientId);
  if (!client) throw new Error('Selecciona un Cliente existente.');
  const contract = invoice.contractId ? getContractById(invoice.contractId) : null;
  if (invoice.contractId && !contract) throw new Error('El contrato vinculado no existe.');
  if (contract && contract.clientId !== invoice.clientId) throw new Error('El contrato no pertenece al Cliente de esta factura.');
  if (invoice.dueDate < invoice.issueDate) throw new Error('El vencimiento no puede ser anterior a la emisión.');
  if (invoice.activityScope !== 'ambas' && invoice.items.some(i => i.activityType !== invoice.activityScope)) throw new Error('El alcance no cubre todos los servicios de la factura.');
  if (invoice.activityScope === 'principal' && invoice.installationBlocks.length) throw new Error('La instalación debe figurar dentro de la Actividad Secundaria.');
  if (contract && contract.activityScope !== 'ambas' && invoice.activityScope !== contract.activityScope) throw new Error('La actividad de la factura no está cubierta por el contrato.');
  if (contract && contract.currency !== invoice.currency) throw new Error('La moneda debe coincidir con la del contrato.');
  if (new Set(invoice.items.map(i => i.id)).size !== invoice.items.length || new Set(invoice.installationBlocks.map(i => i.id)).size !== invoice.installationBlocks.length) throw new Error('Hay identificadores de líneas o equipos duplicados.');
  if (invoice.installationBlocks.some(b => [...b.operatingSystems, ...b.programs, ...b.drivers].some(c => c.price !== 0))) throw new Error('Los importes se facturan en las líneas de servicios; el anexo técnico no añade cargos adicionales.');
  if (!Number.isFinite(invoice.total) || invoice.total > 9_999_999_999.99 || invoice.subtotal > 9_999_999_999.99) throw new Error('El importe total excede el límite admitido.');
  if (invoice.status !== 'borrador' && invoice.status !== 'anulada') {
    if (!contract || !['vigente', 'en_ejecucion'].includes(contract.status)) throw new Error('Para emitir, vincula un contrato vigente o en ejecución.');
    if (invoice.issueDate < contract.startDate || invoice.issueDate > contract.endDate) throw new Error('La emisión debe estar dentro de la vigencia contractual.');
    if (!client.taxId) throw new Error('Completa la identificación fiscal del Cliente antes de emitir.');
    const profile = getSupplierProfile(); if (!profile.taxId || !profile.businessName || !profile.ownerName || !profile.email) throw new Error('Completa los datos fiscales y de contacto del Suministrador en Mi negocio antes de emitir.');
    if (!invoice.items.length) throw new Error('Añade al menos un servicio antes de emitir.');
    if (!invoice.acceptanceStatement.trim()) throw new Error('Es necesaria una declaración de recepción y conformidad.');
  }
}

export function saveInvoice(input: Partial<Invoice> & { clientId: string }): Invoice {
  const existing = input.id ? getInvoiceById(input.id) : undefined;
  if (input.id && !existing) throw new Error('Factura no encontrada.');
  if (existing?.signatureStatus === 'firmada_cliente') throw new Error('El contenido firmado está protegido. Solo se permite actualizar el estado de cobro.');
  if (existing && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fiscal_entries'").get() && db.prepare("SELECT 1 FROM fiscal_entries WHERE json_extract(payload_json,'$.invoiceId')=? LIMIT 1").get(existing.id)) throw new Error('Una factura con movimientos fiscales vinculados no se puede editar. Conserva el original y tramita la rectificación con tu asesor.');
  if (existing?.status === 'anulada') throw new Error('Una factura anulada no se puede editar.');
  if (existing && existing.status !== 'borrador') throw new Error('Una factura emitida conserva su contenido. No se reescribe: tramita anulación o rectificación documentada con tu asesor.');
  if (input.clientSignatureDataUrl || input.clientSignedAt || input.signatureStatus === 'firmada_cliente') throw new Error('Registra la conformidad mediante el proceso de firma del Cliente Final.');
  if (existing && input.updatedAt && input.updatedAt !== existing.updatedAt) throw new Error('La factura cambió en el servidor. Vuelve a abrirla antes de editar.');
  const payload = validate(invoiceInputSchema, input) as Partial<Invoice> & { clientId: string };
  const supplier = getSupplierProfile();
  const now = new Date().toISOString();
  const amounts = calculateInvoiceTotals(payload.items ?? existing?.items ?? [], payload.taxRate ?? existing?.taxRate ?? supplier.defaultTaxRate);
  const items = amounts.items;
  const blocks = payload.installationBlocks ?? existing?.installationBlocks ?? [];
  const hasPrimary = items.some(i => i.activityType === 'principal');
  const hasSecondary = items.some(i => i.activityType === 'secundaria') || blocks.length > 0;
  let sequence = supplier.nextInvoiceSequence;
  let invoiceNumber = payload.invoiceNumber || existing?.invoiceNumber || '';
  const autoNumber = !invoiceNumber;
  if (autoNumber) {
    do { invoiceNumber = `${supplier.invoicePrefix}${String(sequence++).padStart(4, '0')}`; } while (db.prepare('SELECT id FROM invoices WHERE invoice_number=?').get(invoiceNumber));
  }
  if (existing && existing.status !== 'borrador' && invoiceNumber !== existing.invoiceNumber) throw new Error('No se puede cambiar el número de una factura emitida.');
  ensureUnique('invoices', 'invoice_number', invoiceNumber, existing?.id);
  const invoice: Invoice = {
    id: existing?.id || `inv-${randomUUID()}`, invoiceNumber,
    issueDate: payload.issueDate || existing?.issueDate || now.slice(0, 10), dueDate: payload.dueDate || existing?.dueDate || now.slice(0, 10),
    status: payload.status || existing?.status || 'borrador', signatureStatus: 'pendiente_firma', clientId: payload.clientId, contractId: payload.contractId ?? existing?.contractId ?? '',
    activityScope: payload.activityScope || (hasPrimary && hasSecondary ? 'ambas' : hasSecondary ? 'secundaria' : 'principal'), currency: payload.currency || existing?.currency || supplier.defaultCurrency,
    items, installationBlocks: blocks, subtotal: amounts.subtotal, discountTotal: amounts.discountTotal, taxName: payload.taxName ?? existing?.taxName ?? supplier.defaultTaxName,
    taxRate: payload.taxRate ?? existing?.taxRate ?? supplier.defaultTaxRate, taxAmount: amounts.taxAmount, total: amounts.total,
    paymentMethod: payload.paymentMethod ?? existing?.paymentMethod ?? 'Transferencia Bancaria', serviceModality: payload.serviceModality ?? existing?.serviceModality ?? 'Presencial y remota',
    serviceLocation: payload.serviceLocation ?? existing?.serviceLocation ?? '', warrantyNotes: payload.warrantyNotes ?? existing?.warrantyNotes ?? supplier.defaultWarrantyTerms,
    notes: payload.notes ?? existing?.notes ?? '', acceptanceStatement: payload.acceptanceStatement ?? existing?.acceptanceStatement ?? (payload.contractId ? getContractById(payload.contractId)?.acceptanceClause : '') ?? '',
    clientSignerName: payload.clientSignerName ?? existing?.clientSignerName ?? '', clientSignerId: payload.clientSignerId ?? existing?.clientSignerId ?? '', clientSignerRole: payload.clientSignerRole ?? existing?.clientSignerRole ?? '',
    clientSignedAt: '', clientSignatureDataUrl: '', supplierSignatureDataUrl: payload.supplierSignatureDataUrl ?? existing?.supplierSignatureDataUrl ?? supplier.supplierSignatureDataUrl,
    preferredPaperSize: payload.preferredPaperSize || existing?.preferredPaperSize || supplier.defaultPaperSize, preferredOrientation: payload.preferredOrientation || existing?.preferredOrientation || 'portrait',
    createdAt: existing?.createdAt || now, updatedAt: now, isDemo: existing?.isDemo ?? getWorkspaceInfo().demo,
  };
  assertInvoiceDocument(invoice);
  if (invoice.supplierSignatureDataUrl) assertValidSignature(invoice.supplierSignatureDataUrl);
  const snapshot: DocumentSnapshot = { supplier, client: getClientById(invoice.clientId)!, contract: invoice.contractId ? getContractById(invoice.contractId)! : null };
  const { items: _items, installationBlocks: _blocks, isDemo: _demo, ...columns } = invoice;
  return transaction(() => {
    persist('invoices', { ...snakeRow(columns), items_json: JSON.stringify(items), installation_blocks_json: JSON.stringify(blocks), document_snapshot_json: invoice.status === 'borrador' ? '' : JSON.stringify(snapshot), document_hash: '', signature_consent_json: '', is_demo: Number(invoice.isDemo) });
    if (autoNumber) db.prepare('UPDATE supplier_profile SET next_invoice_sequence=?,updated_at=? WHERE id=1').run(sequence, now);
    audit(invoice.id, existing ? 'updated' : 'created', { invoiceNumber, status: invoice.status, total: invoice.total, currency: invoice.currency });
    return getInvoiceById(invoice.id)!;
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Hash covers the commercial/technical content and frozen parties, not the mutable payment state or paper layout. */
export function invoiceDocumentHash(invoice: Invoice): string {
  const keys = ['invoiceNumber', 'issueDate', 'dueDate', 'clientId', 'contractId', 'activityScope', 'currency', 'items', 'installationBlocks', 'subtotal', 'discountTotal', 'taxName', 'taxRate', 'taxAmount', 'total', 'paymentMethod', 'serviceModality', 'serviceLocation', 'warrantyNotes', 'notes', 'acceptanceStatement', 'supplierSignatureDataUrl', 'supplier', 'client', 'contract', 'isDemo'] as const;
  return createHash('sha256').update(canonicalJson(Object.fromEntries(keys.map(key => [key, invoice[key]])))).digest('hex');
}
export function signInvoiceByClient(id: string, input: unknown): Invoice {
  const payload = validate(signatureSchema, input);
  const existing = getInvoiceById(id);
  if (!existing) throw new Error('Factura no encontrada.');
  if (existing.signatureStatus === 'firmada_cliente') throw new Error('La conformidad ya fue registrada y no puede sobrescribirse.');
  if (['borrador', 'anulada'].includes(existing.status)) throw new Error('Solo se pueden firmar facturas emitidas, no borradores ni anuladas.');
  if (payload.expectedUpdatedAt !== existing.updatedAt) throw new Error('El documento cambió desde que lo abriste. Revisa la versión actual antes de firmar.');
  if (!existing.contract || existing.contract.clientId !== existing.clientId) throw new Error('La firma requiere un contrato válido del mismo Cliente.');
  assertValidSignature(payload.clientSignatureDataUrl, true);
  const hash = invoiceDocumentHash(existing);
  const now = new Date().toISOString();
  return transaction(() => {
    db.prepare(`UPDATE invoices SET signature_status='firmada_cliente', client_signer_name=?, client_signer_id=?, client_signer_role=?, client_signature_data_url=?, client_signed_at=?, updated_at=?, document_hash=?, signature_consent_json=?, document_snapshot_json=? WHERE id=?`).run(payload.clientSignerName, payload.clientSignerId, payload.clientSignerRole, payload.clientSignatureDataUrl, now, now, hash, JSON.stringify({ accepted: true, version: 'conformidad-v1', acceptedAt: now, statement: existing.acceptanceStatement, contractClause: existing.contract!.acceptanceClause, electronicSignatureNotice: 'Firma manuscrita electrónica; no firma digital certificada.' }), JSON.stringify({ supplier: existing.supplier, client: existing.client, contract: existing.contract }), id);
    audit(id, 'client_signed', { signerName: payload.clientSignerName, documentHash: hash, consentVersion: 'conformidad-v1' });
    return getInvoiceById(id)!;
  });
}
export function updateInvoiceStatus(id: string, input: unknown): Invoice {
  const status = validate(invoiceStatusSchema, input);
  const existing = getInvoiceById(id);
  if (!existing) throw new Error('Factura no encontrada.');
  if (status === existing.status) return existing;
  if (existing.status === 'anulada') throw new Error('Una factura anulada no se puede reactivar.');
  if (status === 'borrador' && existing.status !== 'borrador') throw new Error('Una factura emitida no puede volver a borrador.');
  if (existing.status === 'borrador' && status !== 'anulada') return saveInvoice({ ...existing, status });
  return transaction(() => {
    db.prepare('UPDATE invoices SET status=?,updated_at=? WHERE id=?').run(status, new Date().toISOString(), id);
    audit(id, 'status_changed', { previous: existing.status, status });
    return getInvoiceById(id)!;
  });
}
export function deleteInvoice(id: string): void { const invoice = getInvoiceById(id); if (!invoice) throw new Error('Factura no encontrada.'); if (invoice.status !== 'borrador' || invoice.signatureStatus === 'firmada_cliente') throw new Error('Solo se eliminan borradores. Anula las facturas emitidas para conservar su trazabilidad.'); db.prepare('DELETE FROM invoices WHERE id=?').run(id); }
export function getInvoiceIntegrity(id: string) {
  const invoice = getInvoiceById(id); if (!invoice) throw new Error('Factura no encontrada.');
  const row = db.prepare('SELECT signature_consent_json FROM invoices WHERE id=?').get(id)!;
  const computedHash = invoiceDocumentHash(invoice);
  return { signed: invoice.signatureStatus === 'firmada_cliente', algorithm: 'SHA-256', recordedHash: invoice.signatureDocumentHash || '', computedHash, matches: !!invoice.signatureDocumentHash && invoice.signatureDocumentHash === computedHash, signedAt: invoice.clientSignedAt, consent: row.signature_consent_json ? JSON.parse(String(row.signature_consent_json)) : null, isDemo: invoice.isDemo };
}
export function getInvoiceEvents(id: string) { if (!getInvoiceById(id)) throw new Error('Factura no encontrada.'); return db.prepare('SELECT event_type,occurred_at,details_json,actor_id,actor_name FROM invoice_events WHERE invoice_id=? ORDER BY id').all(id).map(r => ({ type: r.event_type, occurredAt: r.occurred_at, actorId: String(r.actor_id || ''), actorName: String(r.actor_name || ''), details: JSON.parse(String(r.details_json)) })); }

// Freeze and clearly label the preloaded synthetic signatures. They are not real client acceptances.
for (const row of db.prepare("SELECT id FROM invoices WHERE signature_status='firmada_cliente' AND document_hash=''").all()) {
  const invoice = getInvoiceById(String(row.id))!;
  const snapshot: DocumentSnapshot = { supplier: invoice.supplier!, client: invoice.client!, contract: invoice.contract || null };
  db.prepare('UPDATE invoices SET document_snapshot_json=?,document_hash=?,signature_consent_json=? WHERE id=?').run(JSON.stringify(snapshot), invoiceDocumentHash(invoice), JSON.stringify({ accepted: false, version: 'demo', notice: 'Firma sintética de demostración; no constituye una aceptación real.' }), invoice.id);
}

export function getDashboardStats(): DashboardStats {
  const invoices = listInvoices().filter(i => !['anulada', 'borrador'].includes(i.status));
  const result: DashboardStats = { totalInvoices: invoices.length, totalRevenueByCurrency: {}, paidAmountByCurrency: {}, pendingAmountByCurrency: {}, primaryActivityRevenue: {}, secondaryActivityRevenue: {}, signedInvoicesCount: 0, pendingSignatureCount: 0, activeContractsCount: listContracts().filter(c => ['vigente', 'en_ejecucion'].includes(c.status) && c.endDate >= new Date().toISOString().slice(0, 10)).length, totalClientsCount: listClients().length, totalEquipmentsIntervened: 0 };
  const add = (map: Record<string, number>, currency: string, value: number) => { map[currency] = roundMoney((map[currency] || 0) + value); };
  for (const invoice of invoices) {
    add(result.totalRevenueByCurrency, invoice.currency, invoice.total);
    if (invoice.status === 'pagada') add(result.paidAmountByCurrency, invoice.currency, invoice.total); else add(result.pendingAmountByCurrency, invoice.currency, invoice.total);
    for (const item of invoice.items) add(item.activityType === 'principal' ? result.primaryActivityRevenue : result.secondaryActivityRevenue, invoice.currency, item.lineTotal);
    if (invoice.signatureStatus === 'firmada_cliente') result.signedInvoicesCount++; else result.pendingSignatureCount++;
    result.totalEquipmentsIntervened += invoice.installationBlocks.length;
  }
  return result;
}
