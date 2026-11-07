import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import { randomUUID,createHash } from 'node:crypto';
import ExcelJS from 'exceljs';import JSZip from 'jszip';
import type { FiscalEntryInput } from '../shared/fiscal';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-fiscal-'));process.env.DATA_DIR=root;process.env.SEED_DEMO='true';
const {db,getInvoiceById,saveInvoice,updateInvoiceStatus,saveContract,getContractById}=await import('../server/db');
const {postFiscalEntry,reverseFiscalEntry,fiscalReport,fiscalChainIntegrity,saveFiscalProfile,listFiscalEntries}=await import('../server/fiscal/store');
const {fiscalCsv,fiscalXlsx,fiscalPackage,safeCsvCell}=await import('../server/fiscal/exporter');
const {createApp}=await import('../server/app');const {readConfig}=await import('../server/config');
after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
const entry=(values:Partial<FiscalEntryInput>={}):FiscalEntryInput=>({occurredOn:'2026-01-15',kind:'income',description:'Prueba sintética de cobro',originalAmount:100,currency:'CUP',exchangeRate:1,exchangeRateSource:'',exchangeRateDate:'',evidenceReference:'TEST-REC-001',documented:true,taxCode:'',invoiceId:'',deductibility:'not_deductible',classificationBasis:'',idempotencyKey:randomUUID(),...values});
test('paid invoice status does not invent cash dates; auxiliary reports are never official declarations',()=>{
  const report=fiscalReport(2026);assert.equal(report.totals.income,0);assert.equal(report.entries.length,0);assert.equal(report.officialSubmission.ready,false);assert.equal(report.officialSubmission.incomeYear,2026);assert.equal(report.monthly.length,12);assert.ok(report.invoiceReconciliation.some(i=>i.status==='pagada'&&i.warning.includes('sin cobros')));
});
test('cash entries are idempotent, Decimal rounded to CUP and independently reconciled by actual month',()=>{
  const input=entry(),first=postFiscalEntry(input);assert.equal(postFiscalEntry(input).id,first.id);assert.throws(()=>postFiscalEntry({...input,originalAmount:101}),/idempotencia/);
  const fx=postFiscalEntry(entry({currency:'USD',originalAmount:3.35,exchangeRate:.3,exchangeRateDate:'2026-01-14',exchangeRateSource:'Tasa artificial solo prueba de redondeo'}));assert.equal(fx.cupAmount,1.01);
  const report=fiscalReport(2026);assert.equal(report.totals.income,101.01);assert.equal(report.monthly[0].income,101.01);assert.equal(report.monthly[1].income,0);assert.equal(report.chain.matches,true);
});
test('dates, cash semantics, mixed currencies, maximums and expense classification are validated',()=>{
  for(const values of [{occurredOn:'2026-02-30'},{occurredOn:'2099-12-01'},{originalAmount:1.001},{originalAmount:-10},{currency:'CUP',exchangeRate:2},{currency:'USD'},{kind:'tax_payment' as const},{kind:'expense' as const,deductibility:'deductible' as const},{originalAmount:999999999,exchangeRate:1000000,currency:'USD',exchangeRateSource:'prueba',exchangeRateDate:'2026-01-01'},{deductibility:'pending' as const}])assert.throws(()=>postFiscalEntry(entry(values)));
  const pending=postFiscalEntry(entry({kind:'expense',originalAmount:20,deductibility:'pending',documented:false}));assert.equal(fiscalReport(2026).totals.pendingExpenses,20);
  const review=postFiscalEntry(entry({kind:'expense',originalAmount:5,deductibility:'deductible',classificationBasis:'Clasificación artificial, no constituye recomendación tributaria'}));assert.equal(fiscalReport(2026).totals.operatorClassifiedDeductible,5);assert.equal(pending.sign,1);assert.equal(review.documented,true);
});
test('reversal is append-only, idempotent, same-exercise and cannot reverse twice',()=>{
  const original=postFiscalEntry(entry({originalAmount:13})),input={occurredOn:'2026-02-01',reason:'Corrección de prueba documentada',idempotencyKey:randomUUID()};
  const reverse=reverseFiscalEntry(original.id,input);assert.equal(reverse.sign,-1);assert.equal(reverse.reversesId,original.id);assert.equal(reverseFiscalEntry(original.id,input).id,reverse.id);assert.ok(listFiscalEntries().find(e=>e.id===original.id));
  assert.throws(()=>reverseFiscalEntry(original.id,{...input,idempotencyKey:randomUUID()}),/revertido/);assert.throws(()=>reverseFiscalEntry(reverse.id,{...input,idempotencyKey:randomUUID()}),/reversión/);
  const other=postFiscalEntry(entry());assert.throws(()=>reverseFiscalEntry(other.id,{...input,occurredOn:'2027-01-01',idempotencyKey:randomUUID()}),/ejercicio/);assert.throws(()=>reverseFiscalEntry(other.id,{...input,occurredOn:'2026-01-01',idempotencyKey:randomUUID()}),/posterior/);
});
test('invoice links reject overcollection, prevent edits after linkage, support cross-year receipts and retain cancelled reconciliation',()=>{
  const source=getInvoiceById('inv-01')!;saveContract({...getContractById(source.contractId)!,startDate:'2025-01-01'});const invoice=saveInvoice({...source,id:'',invoiceNumber:'',issueDate:'2025-12-01',dueDate:'2026-01-01'});
  const input=entry({currency:invoice.currency,originalAmount:1,exchangeRate:20,exchangeRateDate:'2026-01-01',exchangeRateSource:'Tipo artificial para prueba',invoiceId:invoice.id});postFiscalEntry(input);
  assert.throws(()=>postFiscalEntry({...input,idempotencyKey:randomUUID(),originalAmount:invoice.total+1}),/supera el saldo/);assert.throws(()=>saveInvoice({...invoice,notes:'Alteración posterior'}),/movimientos fiscales/);
  const report=fiscalReport(2026),line=report.invoiceReconciliation.find(i=>i.id===invoice.id)!;assert.equal(line.issueDate,'2025-12-01');assert.equal(line.recordedCollectionsOriginalCurrency,1);
  assert.equal(fiscalReport(2025).totals.income,0);updateInvoiceStatus(invoice.id,'anulada');assert.match(fiscalReport(2026).invoiceReconciliation.find(i=>i.id===invoice.id)!.warning,/anulada con cobros/);
  assert.throws(()=>postFiscalEntry({...input,idempotencyKey:randomUUID()}),/emitida, no anulada/);
});
test('profile confirmation needs NIT/vector/municipality, and another taxpayer type never enables DJ08',()=>{
  assert.throws(()=>saveFiscalProfile({regime:'tcp',province:'',municipality:'',activityCode:'',fiscalVectorReference:'',accountingAdvisor:'',registrationConfirmed:true}),/Completa/);
  saveFiscalProfile({regime:'tcp',province:'Prueba',municipality:'Municipio ficticio',activityCode:'ACT-PRUEBA',fiscalVectorReference:'VECTOR-FICTICIO',accountingAdvisor:'',registrationConfirmed:true});assert.equal(fiscalReport(2026).profile.registrationConfirmed,true);
  saveFiscalProfile({...fiscalReport(2026).profile,regime:'juridica'});assert.equal(fiscalReport(2026).officialSubmission.ready,false);assert.ok(fiscalReport(2026).warnings.some(w=>w.includes('otra figura')));
});
test('tampered row indexing is detected as well as payload; writes and exports fail closed; DJ08 always returns 409',async()=>{
  const app=http.createServer(createApp({password:'',config:readConfig({TLS_MODE:'off'})}));await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
  try{
    assert.equal((await fetch(url+'/api/fiscal/export/dj08?year=2026')).status,409);
    const last=listFiscalEntries().at(-1)!;db.prepare('UPDATE fiscal_entries SET occurred_on=? WHERE id=?').run('2025-01-01',last.id);
    try{assert.equal(fiscalChainIntegrity().matches,false);assert.throws(()=>postFiscalEntry(entry()),/integridad/);assert.equal((await fetch(url+'/api/fiscal/export/xlsx?year=2026')).status,409);}finally{db.prepare('UPDATE fiscal_entries SET occurred_on=? WHERE id=?').run(last.occurredOn,last.id);}
    const payload=String(db.prepare('SELECT payload_json FROM fiscal_entries WHERE id=?').get(last.id)!.payload_json);db.prepare('UPDATE fiscal_entries SET payload_json=? WHERE id=?').run(JSON.stringify({...JSON.parse(payload),description:'MANIPULADO'}),last.id);
    try{assert.equal(fiscalChainIntegrity().matches,false);}finally{db.prepare('UPDATE fiscal_entries SET payload_json=? WHERE id=?').run(payload,last.id);}
    assert.equal(fiscalChainIntegrity().matches,true);
  }finally{await new Promise<void>(r=>app.close(()=>r()));}
});
test('auxiliary XLSX/CSV/ZIP are real files with warnings, exact hashes and no executable spreadsheet formulas',async()=>{
  postFiscalEntry(entry({description:'=HYPERLINK("https://example.invalid","click")'}));const report=fiscalReport(2026);assert.match(fiscalCsv(report).toString(),/BORRADOR AUXILIAR/);assert.equal(safeCsvCell(' \t=1+1'),'"\' \t=1+1"');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await fiscalXlsx(report) as unknown as ExcelJS.Buffer);assert.equal(workbook.worksheets.length,5);assert.match(String(workbook.worksheets[0].getCell('A1').value),/No es un modelo oficial/);
  const sheet=workbook.getWorksheet('Libro de movimientos')!,cell=sheet.getCell(sheet.rowCount,4);assert.equal(typeof cell.value,'string');assert.equal(cell.type,ExcelJS.ValueType.String);
  const zip=await JSZip.loadAsync(await fiscalPackage(report)),manifest=JSON.parse(await zip.file('manifest.json')!.async('string'));assert.equal(manifest.officialSubmission,false);for(const [name,meta] of Object.entries(manifest.files)){const bytes=await zip.file(name)!.async('nodebuffer');assert.equal(createHash('sha256').update(bytes).digest('hex'),(meta as {sha256:string}).sha256);}assert.equal(JSON.parse(await zip.file('expediente.json')!.async('string')).officialSubmission.ready,false);
});
