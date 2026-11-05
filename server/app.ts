import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { INTERNATIONAL_PAPER_STANDARDS, PAPER_STANDARDS_LIST, type PaperOrientation, type PaperSizeId } from '../shared/paperStandards';
import { deleteClient, deleteContract, deleteInvoice, deleteServiceCatalogItem, getDashboardStats, getInvoiceById, getInvoiceEvents, getInvoiceIntegrity, getSupplierProfile, getWorkspaceInfo, listClients, listContracts, listInvoices, listServiceCatalog, saveClient, saveContract, saveInvoice, saveServiceCatalogItem, signInvoiceByClient, updateInvoiceStatus, updateSupplierProfile } from './db';
import { generateInvoicePdfBuffer } from './exporters/pdfExporter';
import { generateInvoiceDocxBuffer } from './exporters/docxExporter';
import { generateInvoiceXlsxBuffer } from './exporters/xlsxExporter';
import { sanitizeFilename } from './exporters/formatHelpers';

const digest = (value: string) => createHash('sha256').update(value).digest();
function respond(action: (req: Request, res: Response) => unknown, status = 200) { return (req: Request, res: Response, next: express.NextFunction) => { try { const data = action(req, res); if (!res.headersSent) res.status(status).json(data); } catch (error) { next(error); } }; }
export function createApp(options: { password?: string } = {}) {
  const app = express(); const password = options.password ?? process.env.APP_PASSWORD ?? '';
  if (password && password.length < 12) throw new Error('APP_PASSWORD debe tener al menos 12 caracteres.');
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.get('host')) { res.status(403).json({ error: 'Origen de solicitud no autorizado.' }); return; } } catch { res.status(403).json({ error: 'Origen no válido.' }); return; }
    }
    next();
  });
  const sessions = new Map<string, number>(); const attempts = new Map<string, { count: number; reset: number }>();
  const sessionKey = (req: Request) => { const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('nexo_session='))?.slice('nexo_session='.length) || ''; return digest(cookie).toString('hex'); };
  const authenticated = (req: Request) => { if (!password) return true; const key = sessionKey(req); const expires = sessions.get(key); if (!expires || expires < Date.now()) { sessions.delete(key); return false; } return true; };
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Nexo · Sistema de Facturación (Web, Servidor, Móvil)', timestamp: new Date().toISOString(), supportedFormats: ['pdf', 'docx', 'xlsx'], paperStandards: PAPER_STANDARDS_LIST.map(p => p.id) }));
  app.get('/api/session', (req, res) => res.json({ protected: !!password, authenticated: authenticated(req), ...getWorkspaceInfo() }));
  app.post('/api/login', (req, res) => {
    if (!password) { res.json({ ok: true }); return; }
    const now = Date.now(); const key = req.ip || 'unknown';
    for (const [ip, attempt] of attempts) if (attempt.reset < now) attempts.delete(ip);
    if (attempts.size > 5000) { res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' }); return; }
    const attempt = attempts.get(key) || { count: 0, reset: now + 15 * 60_000 };
    if (attempt.count >= 10) { res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' }); return; }
    const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
    if (candidate.length > 1024 || !timingSafeEqual(digest(candidate), digest(password))) { attempt.count++; attempts.set(key, attempt); res.status(401).json({ error: 'La contraseña no es correcta.' }); return; }
    attempts.delete(key); for (const [token, expires] of sessions) if (expires < now) sessions.delete(token);
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!);
    const token = randomBytes(32).toString('hex'); sessions.set(digest(token).toString('hex'), now + 8 * 60 * 60_000);
    res.cookie('nexo_session', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 8 * 60 * 60_000, path: '/' }); res.json({ ok: true });
  });
  app.post('/api/logout', (req, res) => { sessions.delete(sessionKey(req)); res.clearCookie('nexo_session', { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' }); res.json({ ok: true }); });
  app.use('/api', (req, res, next) => { if (!authenticated(req)) { res.status(401).json({ error: 'Inicia sesión para acceder a tu espacio de trabajo.' }); return; } next(); });

  app.get('/api/paper-standards', respond(() => PAPER_STANDARDS_LIST));
  app.get('/api/dashboard', respond(() => ({ stats: getDashboardStats(), recentInvoices: listInvoices().slice(0, 6) })));
  app.get('/api/supplier', respond(() => getSupplierProfile()));
  app.put('/api/supplier', respond(req => updateSupplierProfile(req.body)));
  app.get('/api/clients', respond(() => listClients()));
  app.post('/api/clients', respond(req => saveClient({ ...req.body, id: undefined }), 201));
  app.put('/api/clients/:id', respond(req => saveClient({ ...req.body, id: req.params.id })));
  app.delete('/api/clients/:id', respond(req => { deleteClient(req.params.id); return { ok: true }; }));
  app.get('/api/contracts', respond(() => listContracts()));
  app.post('/api/contracts', respond(req => saveContract({ ...req.body, id: undefined }), 201));
  app.put('/api/contracts/:id', respond(req => saveContract({ ...req.body, id: req.params.id })));
  app.delete('/api/contracts/:id', respond(req => { deleteContract(req.params.id); return { ok: true }; }));
  app.get('/api/catalog', respond(() => listServiceCatalog()));
  app.post('/api/catalog', respond(req => saveServiceCatalogItem({ ...req.body, id: undefined }), 201));
  app.put('/api/catalog/:id', respond(req => saveServiceCatalogItem({ ...req.body, id: req.params.id })));
  app.delete('/api/catalog/:id', respond(req => { deleteServiceCatalogItem(req.params.id); return { ok: true }; }));
  app.get('/api/invoices', respond(() => listInvoices()));
  app.get('/api/invoices/:id', respond((req, res) => { const invoice = getInvoiceById(req.params.id); if (!invoice) { res.status(404).json({ error: 'Factura no encontrada.' }); return; } return invoice; }));
  app.post('/api/invoices', respond(req => saveInvoice({ ...req.body, id: undefined }), 201));
  app.put('/api/invoices/:id', respond(req => saveInvoice({ ...req.body, id: req.params.id })));
  app.patch('/api/invoices/:id/status', respond(req => updateInvoiceStatus(req.params.id, req.body?.status)));
  app.post('/api/invoices/:id/sign', respond(req => signInvoiceByClient(req.params.id, req.body)));
  app.get('/api/invoices/:id/integrity', respond(req => getInvoiceIntegrity(req.params.id)));
  app.get('/api/invoices/:id/events', respond(req => getInvoiceEvents(req.params.id)));
  app.delete('/api/invoices/:id', respond(req => { deleteInvoice(req.params.id); return { ok: true }; }));
  app.get('/api/invoices/:id/export/:format', async (req, res, next) => {
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
  const errorHandler: ErrorRequestHandler = (error: Error & { type?: string; code?: string }, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'La solicitud supera el límite de 4 MB.' }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'El cuerpo JSON de la solicitud no es válido.' }); return; }
    if (error.code?.includes('CONSTRAINT_FOREIGNKEY') || error.message.includes('FOREIGN KEY constraint')) { res.status(409).json({ error: 'No se puede eliminar un Cliente con contratos o facturas asociados.' }); return; }
    if (error.message.includes('UNIQUE constraint')) { res.status(409).json({ error: 'Este número o código ya existe.' }); return; }
    if (error.code?.startsWith('ERR_SQLITE')) { console.error('Error de base de datos:', error.code); res.status(500).json({ error: 'No se pudo completar la operación de almacenamiento.' }); return; }
    res.status(/no encontrad[oa]/i.test(error.message) ? 404 : 400).json({ error: error.message || 'No se pudo completar la solicitud.' });
  };
  app.use(errorHandler);
  return app;
}
