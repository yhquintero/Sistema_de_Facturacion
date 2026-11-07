import type { Express, NextFunction, Request, Response } from 'express';
import { fiscalProfile, saveFiscalProfile, listFiscalEntries, postFiscalEntry, reverseFiscalEntry, fiscalReport } from './store';
import { fiscalCsv, fiscalPackage, fiscalXlsx } from './exporter';
import { publishChange } from '../realtime';
import { createLimiter } from '../security/http';
import { peerId, securityLog } from '../security/log';
const handle = (fn: (req: Request) => unknown, mutation = false) => (req: Request,res: Response,next: NextFunction) => { try { const value = fn(req); res.status(mutation && req.method === 'POST' ? 201 : 200).json(value); if (mutation) publishChange('fiscal'); } catch (error) { next(error); } };
const yearOf = (value: unknown) => { const year = Number(value); if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Indica un ejercicio fiscal entre 2000 y 2100.'); return year; };
export function installFiscalRoutes(app: Express) {
  const limit = createLimiter(10,60_000);
  app.get('/api/fiscal/profile',handle(() => fiscalProfile())); app.put('/api/fiscal/profile',handle(req => saveFiscalProfile(req.body),true));
  app.get('/api/fiscal/entries',handle(req => listFiscalEntries(yearOf(req.query.year)))); app.post('/api/fiscal/entries',handle(req => postFiscalEntry(req.body),true));
  app.post('/api/fiscal/entries/:id/reverse',handle(req => reverseFiscalEntry(req.params.id,req.body),true));
  app.get('/api/fiscal/report',handle(req => fiscalReport(yearOf(req.query.year))));
  app.get('/api/fiscal/export/:format', async (req,res,next) => {
    if (!limit(peerId(req),res)) return;
    try {
      const report = fiscalReport(yearOf(req.query.year)), format = req.params.format;
      if (format === 'dj08') { res.status(409).json({ error: report.officialSubmission.reason, officialSubmission: report.officialSubmission }); return; }
      if (!['xlsx','csv','zip'].includes(format)) { res.status(400).json({ error: 'Formato auxiliar no admitido. Usa xlsx, csv o zip.' }); return; }
      if (!report.chain.matches) { res.status(409).json({ error: 'La integridad del libro fiscal no coincide. Exportación bloqueada; conserva e investiga el original.' }); return; }
      const buffer = format === 'xlsx' ? await fiscalXlsx(report) : format === 'csv' ? fiscalCsv(report) : await fiscalPackage(report);
      res.setHeader('Content-Type',format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : format === 'zip' ? 'application/zip' : 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',`attachment; filename="AUXILIAR_NO_OFICIAL_CUBA_${report.year}.${format}"`); securityLog('fiscal_export', { requestId: res.locals.requestId, actor: 'workspace-admin', reason: `auxiliary:${format}:${report.year}` }); res.send(buffer);
    } catch (error) { next(error); }
  });
}
