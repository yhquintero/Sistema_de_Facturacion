import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { INTERNATIONAL_PAPER_STANDARDS, PAPER_STANDARDS_LIST, type PaperOrientation, type PaperSizeId } from '../shared/paperStandards';
import { deleteClient, deleteContract, deleteInvoice, deleteServiceCatalogItem, getDashboardStats, getInvoiceById, getInvoiceEvents, getInvoiceIntegrity, getRevenueGoals, getSupplierProfile, getWorkspaceInfo, listClients, listContracts, listInvoices, listServiceCatalog, saveClient, saveRevenueGoals, saveContract, saveInvoice, saveServiceCatalogItem, signInvoiceByClient, updateInvoiceStatus, updateSupplierProfile } from './db';
import { generateInvoicePdfBuffer } from './exporters/pdfExporter';
import { generateInvoiceDocxBuffer } from './exporters/docxExporter';
import { generateInvoiceXlsxBuffer } from './exporters/xlsxExporter';
import { sanitizeFilename } from './exporters/formatHelpers';
import { readConfig, type RuntimeConfig } from './config';
import { installHttpSecurity, createLimiter, isWrite } from './security/http';
import { installSessions } from './security/sessions';
import { requirePermission, assertCan } from './security/authorization';
import { peerId, securityLog } from './security/log';
import type { SecurityStatus } from '../shared/security';
import { installFiscalRoutes } from './fiscal/routes';
import { installRealtime, publishChange, realtimeConnectionCount } from './realtime';

function respond(action: (req: Request, res: Response) => unknown, status = 200) { return (req: Request, res: Response, next: express.NextFunction) => { try { const data = action(req, res); if (!res.headersSent) res.status(status).json(data); if (isWrite(req) && res.statusCode < 400) publishChange(req.path.split('/')[2] || 'workspace'); } catch (error) { next(error); } }; }
export function createApp(options: { password?: string; config?: RuntimeConfig; allowSetup?: boolean; adminUsername?: string } = {}) {
  const app = express(); const config = options.config || readConfig();
  installHttpSecurity(app, config);
  const apiLimit = createLimiter(900, 60_000), exportLimit = createLimiter(20, 60_000);
  app.use('/api', (req, res, next) => { if (req.path === '/health' || apiLimit(peerId(req), res)) next(); });
  app.use(express.json({ limit: '4mb', strict: true }));
  app.get('/api/health', (req, res) => { if (config.controlInstance && req.get('X-Nexo-Control-Instance') === config.controlInstance && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) res.setHeader('X-Nexo-Instance',config.controlInstance); res.json({ ok: true, service: 'Nexo Facturación', timestamp: new Date().toISOString() }); });
  app.get('/api/privacy', (_req, res) => res.json({ version: '2026-11-04', jurisdiction: 'CU', configured: !!config.controllerName && !!config.privacyContact, controller: config.controllerName || 'Pendiente de identificar por el responsable', contact: config.privacyContact || 'Pendiente de configurar', purpose: 'Gestión contractual, facturación, soporte técnico y obligaciones tributarias. Sin publicidad ni analítica de terceros.', cookies: 'Solo cookie de sesión necesaria; sin seguimiento publicitario.', retention: 'Según calendario aprobado y obligaciones legales; no se elimina automáticamente información fiscal o sujeta a conservación.', dataLocationDeclared: config.dataCountry, warning: 'Este texto informativo no sustituye el aviso de privacidad y el calendario de conservación aprobados por el responsable.' }));
  const authentication = installSessions(app, config, options.password, options);
  installRealtime(app, authentication.check);
  installFiscalRoutes(app);
  app.get('/api/security/status', requirePermission('security.read'), (req, res) => res.json({ tls: { configuredMode: config.tlsMode, observedHttps: req.secure, publicOrigin: config.publicOrigin }, authentication: { enabled: authentication.enabled, credentialKind: authentication.credentialKind, csrf: authentication.enabled, idleTimeoutMinutes: 30, absoluteTimeoutHours: 8, multiuser: true, mfa: false }, backupEncryptionConfigured: !!config.backupKeyFile, dataAtRestEncryption: 'Requiere BitLocker/LUKS o almacenamiento cifrado verificado; SQLite no está cifrado por la aplicación.', declaredDataCountry: config.dataCountry, residencyVerified: false, realtimeConnections: realtimeConnectionCount(), privacyConfigured: !!config.privacyContact && !!config.controllerName, fiscal: { jurisdiction: 'CU', officialDj08Ready: false, reason: 'Plantilla e instructivo oficiales para ingresos 2026/campaña 2027 pendientes de verificación.' }, assessedAt: '2026-11-04', externalTlsScanVerified: false } satisfies SecurityStatus));
  app.get('/api/paper-standards', respond(() => PAPER_STANDARDS_LIST));
  app.get('/api/dashboard', respond(() => ({ stats: getDashboardStats(), recentInvoices: listInvoices().slice(0, 6) })));
  app.get('/api/supplier', respond(() => getSupplierProfile()));
  app.put('/api/supplier', requirePermission('supplier.write'), respond(req => updateSupplierProfile(req.body)));
  app.get('/api/goals', respond(() => getRevenueGoals()));
  app.put('/api/goals', requirePermission('supplier.write'), respond(req => saveRevenueGoals(req.body)));
  app.get('/api/clients', respond(() => listClients()));
  app.post('/api/clients', requirePermission('clients.write'), respond(req => saveClient({ ...req.body, id: undefined }), 201));
  app.put('/api/clients/:id', requirePermission('clients.write'), respond(req => saveClient({ ...req.body, id: req.params.id })));
  app.delete('/api/clients/:id', requirePermission('clients.write'), respond(req => { deleteClient(req.params.id); return { ok: true }; }));
  app.get('/api/contracts', respond(() => listContracts()));
  app.post('/api/contracts', requirePermission('contracts.write'), respond(req => saveContract({ ...req.body, id: undefined }), 201));
  app.put('/api/contracts/:id', requirePermission('contracts.write'), respond(req => saveContract({ ...req.body, id: req.params.id })));
  app.delete('/api/contracts/:id', requirePermission('contracts.write'), respond(req => { deleteContract(req.params.id); return { ok: true }; }));
  app.get('/api/catalog', respond(() => listServiceCatalog()));
  app.post('/api/catalog', requirePermission('catalog.write'), respond(req => saveServiceCatalogItem({ ...req.body, id: undefined }), 201));
  app.put('/api/catalog/:id', requirePermission('catalog.write'), respond(req => saveServiceCatalogItem({ ...req.body, id: req.params.id })));
  app.delete('/api/catalog/:id', requirePermission('catalog.write'), respond(req => { deleteServiceCatalogItem(req.params.id); return { ok: true }; }));
  app.get('/api/invoices', respond(() => listInvoices()));
  app.get('/api/invoices/:id', respond((req, res) => { const invoice = getInvoiceById(req.params.id); if (!invoice) { res.status(404).json({ error: 'Factura no encontrada.' }); return; } return invoice; }));
  app.post('/api/invoices', requirePermission('invoices.draft'), respond((req, res) => { if (req.body?.status && req.body.status !== 'borrador') assertCan(res, 'invoices.issue'); return saveInvoice({ ...req.body, id: undefined }); }, 201));
  app.put('/api/invoices/:id', requirePermission('invoices.draft'), respond((req, res) => { const existing = getInvoiceById(req.params.id); if ((existing && existing.status !== 'borrador') || (req.body?.status && req.body.status !== 'borrador')) assertCan(res, 'invoices.issue'); return saveInvoice({ ...req.body, id: req.params.id }); }));
  app.patch('/api/invoices/:id/status', requirePermission('invoices.issue'), respond(req => updateInvoiceStatus(req.params.id, req.body?.status)));
  app.post('/api/invoices/:id/sign', requirePermission('invoices.sign'), respond(req => signInvoiceByClient(req.params.id, req.body)));
  app.get('/api/invoices/:id/integrity', respond(req => getInvoiceIntegrity(req.params.id)));
  app.get('/api/invoices/:id/events', respond(req => getInvoiceEvents(req.params.id)));
  app.delete('/api/invoices/:id', requirePermission('invoices.delete'), respond(req => { deleteInvoice(req.params.id); return { ok: true }; }));
  app.get('/api/invoices/:id/export/:format', (req, res, next) => { if (exportLimit(peerId(req), res)) next(); }, async (req, res, next) => {
    try {
      const invoice = getInvoiceById(req.params.id); if (!invoice) { res.status(404).json({ error: 'Factura no encontrada.' }); return; }
      const format = req.params.format.toLowerCase(); const paper = String(req.query.paper || invoice.preferredPaperSize).toUpperCase(); const orientation = String(req.query.orientation || invoice.preferredOrientation);
      if (!['pdf', 'docx', 'xlsx'].includes(format)) { res.status(400).json({ error: 'Formato no soportado. Usa pdf, docx o xlsx.' }); return; }
      if (!Object.hasOwn(INTERNATIONAL_PAPER_STANDARDS, paper) || !['portrait', 'landscape'].includes(orientation)) { res.status(400).json({ error: 'Formato de hoja u orientación no válidos.' }); return; }
      if (invoice.signatureStatus === 'firmada_cliente' && !getInvoiceIntegrity(invoice.id).matches) { res.status(409).json({ error: 'La integridad del contenido firmado no coincide. Revisa el registro original.' }); return; }
      const paperSize = paper as PaperSizeId, pageOrientation = orientation as PaperOrientation;
      const buffer = format === 'pdf' ? await generateInvoicePdfBuffer(invoice, paperSize, pageOrientation) : format === 'docx' ? await generateInvoiceDocxBuffer(invoice, paperSize, pageOrientation) : await generateInvoiceXlsxBuffer(invoice, paperSize, pageOrientation);
      const types: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      const filename = `${sanitizeFilename(invoice.invoiceNumber)}_${paper}_${orientation === 'landscape' ? 'Horizontal' : 'Vertical'}.${format}`;
      res.setHeader('Content-Type', types[format]); res.setHeader('Content-Disposition', `${format === 'pdf' && req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${filename}"`); res.send(buffer);
    } catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso de API no encontrado.' }));
  const errorHandler: ErrorRequestHandler = (error: Error & { type?: string; code?: string; status?: number }, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.status && error.status >= 400 && error.status < 600 && !error.type) { res.status(error.status).json({ error: error.message, ...(error.code ? {code:error.code} : {}) }); return; }
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'La solicitud supera el límite de 4 MB.' }); return; }
    if (error.type === 'entity.parse.failed') { res.status(400).json({ error: 'El cuerpo JSON de la solicitud no es válido.' }); return; }
    if (error.code?.includes('CONSTRAINT_FOREIGNKEY') || error.message.includes('FOREIGN KEY constraint')) { res.status(409).json({ error: 'No se puede eliminar un Cliente con contratos o facturas asociados.' }); return; }
    if (error.message.includes('UNIQUE constraint')) { res.status(409).json({ error: 'Este número o código ya existe.' }); return; }
    if (error.code || ['TypeError', 'ReferenceError', 'SyntaxError'].includes(error.name)) { securityLog('internal_error', { requestId: res.locals.requestId, status: 500, reason: error.code || error.name }); res.status(500).json({ error: 'No se pudo completar la operación. Consulta el identificador de solicitud con el administrador.' }); return; }
    res.status(/no encontrad[oa]/i.test(error.message) ? 404 : 400).json({ error: error.message || 'No se pudo completar la solicitud.' });
  };
  app.use(errorHandler);
  return app;
}
