import { createHash, randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { db, getInvoiceById, getSupplierProfile, getWorkspaceInfo, listInvoices } from '../db';
import { validate } from '../validation';
import { roundMoney } from '../../shared/invoiceMath';
import { ONAT_MODELS_URL, type FiscalEntry, type FiscalEntryInput, type FiscalProfile, type FiscalReport } from '../../shared/fiscal';
import { SUPPORTED_CURRENCIES } from '../../shared/types';
const text = (max = 300) => z.string().trim().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + 'T12:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v; }, 'Fecha no válida.');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const amount = z.number().finite().positive().max(999999999).refine(v => new Decimal(v).decimalPlaces() <= 2, 'Máximo dos decimales.');
const inputSchema = z.object({ occurredOn: date, kind: z.enum(['income','expense','tax_payment','social_security','withholding']), description: text(600).min(1), originalAmount: amount, currency: z.enum(SUPPORTED_CURRENCIES.map(c => c.code) as [string,...string[]]), exchangeRate: z.number().finite().positive().max(1000000), exchangeRateSource: text(500), exchangeRateDate: z.union([z.literal(''),date]), evidenceReference: text(300).min(1, 'Indica el comprobante o referencia documental.'), documented: z.boolean(), taxCode: text(80), invoiceId: text(100), deductibility: z.enum(['pending','deductible','not_deductible']), classificationBasis: text(600), idempotencyKey: z.string().uuid() });
const profileSchema = z.object({ regime: z.enum(['tcp','juridica','unconfirmed']), province: text(100), municipality: text(100), activityCode: text(100), fiscalVectorReference: text(300), accountingAdvisor: text(160), registrationConfirmed: z.boolean() });

db.exec(`CREATE TABLE IF NOT EXISTS fiscal_entries (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, occurred_on TEXT NOT NULL, payload_json TEXT NOT NULL, previous_hash TEXT NOT NULL, entry_hash TEXT NOT NULL, request_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, reverses_id TEXT UNIQUE REFERENCES fiscal_entries(id)); CREATE INDEX IF NOT EXISTS fiscal_date_idx ON fiscal_entries(occurred_on);`);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function transaction<T>(callback: () => T) { db.exec('BEGIN IMMEDIATE'); try { const value = callback(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } }
function hydrate(row: Record<string, unknown>): FiscalEntry { return { ...JSON.parse(String(row.payload_json)), previousHash: String(row.previous_hash), hash: String(row.entry_hash) }; }
export function fiscalProfile(): FiscalProfile { const row = db.prepare("SELECT value FROM app_metadata WHERE key='cuba_fiscal_profile'").get(); return row ? JSON.parse(String(row.value)) : { regime: 'tcp', province: '', municipality: '', activityCode: '', fiscalVectorReference: '', accountingAdvisor: '', registrationConfirmed: false, updatedAt: '' }; }
export function saveFiscalProfile(input: unknown) { const value = validate(profileSchema, input); if (value.registrationConfirmed && (!value.municipality || !value.province || !value.activityCode || !value.fiscalVectorReference || !getSupplierProfile().taxId)) throw new Error('Completa datos fiscales del Suministrador, provincia, municipio, actividad y referencia del vector antes de confirmar.'); const profile: FiscalProfile = { ...value, updatedAt: new Date().toISOString() }; db.prepare("INSERT INTO app_metadata (key,value) VALUES ('cuba_fiscal_profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(profile)); return profile; }
export function listFiscalEntries(year?: number): FiscalEntry[] { return (year ? db.prepare('SELECT * FROM fiscal_entries WHERE occurred_on >= ? AND occurred_on <= ? ORDER BY seq').all(`${year}-01-01`,`${year}-12-31`) : db.prepare('SELECT * FROM fiscal_entries ORDER BY seq').all()).map(hydrate); }
function insert(input: FiscalEntryInput, sign: 1 | -1, reversesId = '', requestHash = sha(JSON.stringify(input))) {
  if (!fiscalChainIntegrity().matches) throw new Error('La integridad del libro no coincide. Conserva el original y solicita revisión.');
  const previousHash = String(db.prepare('SELECT entry_hash FROM fiscal_entries ORDER BY seq DESC LIMIT 1').get()?.entry_hash || 'GENESIS');
  const cupAmount = new Decimal(input.originalAmount).mul(input.exchangeRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  if (cupAmount > 9999999999.99) throw new Error('El equivalente CUP excede el límite admitido.');
  const payload = { ...input, id: `fis-${randomUUID()}`, createdAt: new Date().toISOString(), cupAmount, sign, reversesId };
  const serialized = JSON.stringify(payload), hash = sha(previousHash + '\n' + serialized);
  db.prepare('INSERT INTO fiscal_entries (id,occurred_on,payload_json,previous_hash,entry_hash,request_hash,idempotency_key,reverses_id) VALUES (?,?,?,?,?,?,?,?)').run(payload.id,input.occurredOn,serialized,previousHash,hash,requestHash,input.idempotencyKey,reversesId || null);
  return { ...payload, previousHash, hash } as FiscalEntry;
}
export function postFiscalEntry(source: unknown): FiscalEntry {
  const input = validate(inputSchema, source), requestHash = sha(JSON.stringify(input));
  if (input.occurredOn > today()) throw new Error('Un movimiento real no puede tener fecha futura en Cuba.');
  if (input.currency === 'CUP' && input.exchangeRate !== 1) throw new Error('Un movimiento en CUP exige tipo de cambio 1.');
  if (input.currency !== 'CUP' && (!input.exchangeRateSource || !input.exchangeRateDate || input.exchangeRateDate > input.occurredOn)) throw new Error('Registra la fuente, fecha y tipo de cambio aplicable. No se asume una tasa automática.');
  if (input.kind !== 'expense' && input.deductibility !== 'not_deductible') throw new Error('La deducibilidad solo se clasifica en gastos.');
  if (input.kind === 'expense' && input.deductibility === 'deductible' && (!input.documented || !input.classificationBasis)) throw new Error('Un gasto clasificado como deducible exige soporte y fundamento revisado; esta selección no certifica su deducción legal.');
  if (['tax_payment','social_security','withholding'].includes(input.kind) && !input.taxCode) throw new Error('Indica el código del tributo/concepto según tu vector fiscal.');
  return transaction(() => {
    const existing = db.prepare('SELECT * FROM fiscal_entries WHERE idempotency_key=?').get(input.idempotencyKey);
    if (existing) { if (existing.request_hash !== requestHash) throw new Error('La clave de idempotencia ya fue usada con datos distintos.'); return hydrate(existing); }
    if (input.invoiceId) {
      const invoice = getInvoiceById(input.invoiceId);
      if (!invoice || ['borrador','anulada'].includes(invoice.status) || input.kind !== 'income' || invoice.currency !== input.currency) throw new Error('El cobro debe vincularse a una factura emitida, no anulada, y de la misma moneda.');
      const collected = listFiscalEntries().filter(e => e.invoiceId === invoice.id && e.kind === 'income').reduce((sum,e) => sum.plus(new Decimal(e.originalAmount).mul(e.sign)), new Decimal(0));
      if (collected.plus(input.originalAmount).greaterThan(invoice.total)) throw new Error('El cobro supera el saldo de la factura. Registra anticipos sin vincular o revisa los movimientos.');
    }
    return insert(input,1,'',requestHash);
  });
}
export function reverseFiscalEntry(id: string, source: unknown) {
  const data = validate(z.object({ occurredOn: date, reason: text(600).min(5), idempotencyKey: z.string().uuid() }), source);
  return transaction(() => {
    const row = db.prepare('SELECT * FROM fiscal_entries WHERE id=?').get(id); if (!row) throw new Error('Movimiento no encontrado.'); const original = hydrate(row);
    const requestHash = sha(JSON.stringify({ id, ...data })); const retry = db.prepare('SELECT * FROM fiscal_entries WHERE idempotency_key=?').get(data.idempotencyKey);
    if (retry) { if (retry.request_hash !== requestHash) throw new Error('Clave de idempotencia reutilizada.'); return hydrate(retry); }
    if (original.sign !== 1 || db.prepare('SELECT id FROM fiscal_entries WHERE reverses_id=?').get(id)) throw new Error('Este movimiento ya fue revertido o es un asiento de reversión.');
    if (data.occurredOn.slice(0,4) !== original.occurredOn.slice(0,4) || data.occurredOn < original.occurredOn || data.occurredOn > today()) throw new Error('La reversión debe ser posterior o igual, no futura y del mismo ejercicio. Para otros ejercicios tramita la rectificación con tu asesor.');
    return insert({ ...validate(inputSchema, original), occurredOn: data.occurredOn, description: `REVERSIÓN: ${data.reason}`, idempotencyKey: data.idempotencyKey }, -1, id, requestHash);
  });
}
export function fiscalChainIntegrity() {
  let previous = 'GENESIS', count = 0, matches = true;
  for (const row of db.prepare('SELECT * FROM fiscal_entries ORDER BY seq').all()) {
    try { const payload = JSON.parse(String(row.payload_json)); if (row.id !== payload.id || row.occurred_on !== payload.occurredOn || row.idempotency_key !== payload.idempotencyKey || (row.reverses_id || '') !== payload.reversesId || row.previous_hash !== previous || sha(previous + '\n' + String(row.payload_json)) !== row.entry_hash) matches = false; } catch { matches = false; }
    previous = String(row.entry_hash); count++;
  }
  return { matches, entriesChecked: count, independentlySealed: false as const };
}
export function fiscalReport(year: number): FiscalReport {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Ejercicio fiscal no válido.');
  const profile = fiscalProfile(), entries = listFiscalEntries(year), warnings: string[] = [], chain = fiscalChainIntegrity();
  const sum = (kind: FiscalEntry['kind'], filter: (e: FiscalEntry) => boolean = () => true) => entries.filter(e => e.kind === kind && filter(e)).reduce((n,e) => n.plus(new Decimal(e.cupAmount).mul(e.sign)),new Decimal(0)).toNumber();
  const totals = { income: sum('income'), expense: sum('expense'), tax_payment: sum('tax_payment'), social_security: sum('social_security'), withholding: sum('withholding'), operatorClassifiedDeductible: sum('expense', e => e.deductibility === 'deductible'), pendingExpenses: sum('expense', e => e.deductibility === 'pending') };
  const monthly = Array.from({ length: 12 }, (_,i) => { const month = `${year}-${String(i+1).padStart(2,'0')}`; const total = (kind: FiscalEntry['kind']) => sum(kind, e => e.occurredOn.startsWith(month)); return { month, income: total('income'), expense: total('expense'), tax_payment: total('tax_payment'), social_security: total('social_security'), withholding: total('withholding') }; });
  const all = listFiscalEntries();
  const linkedInYear = new Set(entries.map(e => e.invoiceId));
  const invoiceReconciliation = listInvoices().filter(i => (i.issueDate.startsWith(`${year}-`) || linkedInYear.has(i.id)) && !['borrador'].includes(i.status)).map(invoice => {
    const collected = roundMoney(all.filter(e => e.kind === 'income' && e.invoiceId === invoice.id).reduce((n,e) => n + e.originalAmount * e.sign,0));
    return { id: invoice.id, number: invoice.invoiceNumber, issueDate: invoice.issueDate, currency: invoice.currency, total: invoice.total, recordedCollectionsOriginalCurrency: collected, status: invoice.status, warning: invoice.status === 'anulada' ? (collected ? 'Factura anulada con cobros vinculados: revisar devolución/rectificación documentada; no se inventa compensación.' : 'Factura anulada; se conserva su número y trazabilidad.') : invoice.status === 'pagada' && collected !== invoice.total ? 'Marcada pagada sin cobros completos en el libro; no se inventan ingresos ni fechas.' : invoice.status !== 'pagada' && collected >= invoice.total ? 'Libro cobrado; revisar estado comercial.' : collected < invoice.total ? 'Saldo pendiente o cobros no registrados.' : '' };
  });
  if (!profile.registrationConfirmed) warnings.push('Perfil y vector fiscal sin confirmar. La inscripción y actividad autorizada deben contrastarse con ONAT.');
  if (profile.regime !== 'tcp') warnings.push('La DJ-08 de TCP no sustituye la declaración de otra figura tributaria.');
  if (!entries.length) warnings.push('No hay movimientos registrados. No equivale a una declaración sin movimiento revisada.');
  if (entries.some(e => !e.documented)) warnings.push('Existen movimientos con soporte documental pendiente. Una referencia escrita no acredita por sí sola el documento.');
  if (totals.pendingExpenses) warnings.push('Hay gastos pendientes de clasificación. El sistema no determina automáticamente su deducibilidad ni la cuota fiscal.');
  if (invoiceReconciliation.some(i => i.warning)) warnings.push('Hay diferencias de conciliación. El estado pagada no se trata como un cobro con fecha ni justifica por sí solo el ingreso fiscal.');
  if (!chain.matches) warnings.push('ALERTA: la cadena de movimientos no coincide. Se bloquea la exportación fiscal; investiga el registro original.');
  if (getWorkspaceInfo().demo) warnings.push('ESPACIO DE DEMOSTRACIÓN. No presentar sus documentos como datos reales.');
  warnings.push('Comprueba si debes llevar contabilidad conforme a NCIF, inventarios, activos y obligaciones laborales: este libro auxiliar no sustituye un sistema contable completo.');
  warnings.push('La firma dibujada de una factura no es el certificado digital requerido por una eventual presentación electrónica ONAT. No hay envío automático ni integración autorizada con ONAT.');
  return { year, generatedAt: new Date().toISOString(), profile, isDemo: getWorkspaceInfo().demo, entries, totals, monthly, invoiceReconciliation, chain, warnings, officialSubmission: { ready: false, form: 'DJ-08', incomeYear: year, reason: `Borrador auxiliar del ejercicio ${year}. Falta validar plantilla, instructivo, reglas de liquidación y vector fiscal aplicables; para ingresos 2026 no se reutiliza la escala de liquidación de ingresos 2025 de la Ley 181.`, modelsUrl: ONAT_MODELS_URL } };
}
