import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PNG } from 'pngjs';
import { calculateInvoiceTotals } from '../shared/invoiceMath';
import { OFFICIAL_PRIMARY_ACTIVITY, OFFICIAL_SECONDARY_ACTIVITY, type InvoiceLineItem } from '../shared/types';
import { assertValidSignature, createSampleSignatureDataUrl } from '../server/utils/signaturePng';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-domain-')); process.env.DATA_DIR = directory; process.env.SEED_DEMO = 'true';
const store = await import('../server/db');
after(() => { store.db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const base = () => ({ clientId: 'cli-01', contractId: 'ctr-01', issueDate: '2026-11-05', dueDate: '2026-11-20', status: 'emitida' as const, activityScope: 'ambas' as const, currency: 'USD', items: store.getInvoiceById('inv-01')!.items, taxRate: 10 });

test('the two official activities are stored verbatim and cannot be silently replaced', () => {
  assert.equal(store.getSupplierProfile().primaryActivity, OFFICIAL_PRIMARY_ACTIVITY); assert.equal(store.getSupplierProfile().secondaryActivity, OFFICIAL_SECONDARY_ACTIVITY);
  store.updateSupplierProfile({ primaryActivity: 'Modified', secondaryActivity: 'Modified' });
  assert.equal(store.getSupplierProfile().primaryActivity, OFFICIAL_PRIMARY_ACTIVITY); assert.equal(store.getSupplierProfile().secondaryActivity, OFFICIAL_SECONDARY_ACTIVITY);
});
test('dashboard excludes drafts and cancelled invoices and never sums different currencies', () => {
  const initial = store.getDashboardStats(); assert.equal(initial.totalRevenueByCurrency.USD, 3689.4); assert.equal(initial.paidAmountByCurrency.USD, 440); assert.equal(initial.pendingAmountByCurrency.USD, 3249.4);
  const draft = store.saveInvoice({ clientId: 'cli-01', items: base().items, status: 'borrador', currency: 'EUR' }); assert.equal(store.getDashboardStats().totalRevenueByCurrency.EUR, undefined); store.deleteInvoice(draft.id);
});
test('client CRUD merges partial edits, rejects duplicates and retains linked clients', () => {
  const client = store.saveClient({ code: 'CLIENT-TEST', name: 'Empresa de prueba', email: 'hello@example.com' });
  const updated = store.saveClient({ id: client.id, name: 'Nombre revisado' }); assert.equal(updated.email, client.email); assert.equal(updated.code, client.code);
  assert.throws(() => store.saveClient({ code: 'CLIENT-TEST', name: 'Duplicado' }), /existe/);
  assert.throws(() => store.saveClient({ id: 'missing', name: 'Nada' }), /no encontrado/);
  assert.throws(() => store.saveClient({ code: 'BAD', name: '   ' }), /obligatorio/);
  assert.throws(() => store.deleteClient('cli-01'), /FOREIGN KEY/);
  store.deleteClient(client.id); assert.equal(store.getClientById(client.id), undefined);
});
test('contracts cannot cross clients, lose validity or be deleted while linked', () => {
  const contract = store.getContractById('ctr-01')!;
  assert.throws(() => store.saveContract({ ...contract, endDate: '2020-01-01' }), /vigencia/);
  assert.throws(() => store.saveContract({ ...contract, clientId: 'cli-02' }), /cambiar el Cliente/);
  assert.throws(() => store.deleteContract(contract.id), /facturas vinculadas/);
  const added = store.saveContract({ ...contract, id: undefined, contractNumber: 'CTR-NEW' }); assert.equal(added.clientName, store.getClientById('cli-01')!.name); store.deleteContract(added.id);
});
test('service CRUD enforces activity and price constraints', () => {
  const source = store.listServiceCatalog()[0]; const service = store.saveServiceCatalogItem({ ...source, id: undefined, code: 'TEST-SERVICE' });
  assert.equal(store.saveServiceCatalogItem({ id: service.id, basePrice: 42 }).basePrice, 42);
  assert.throws(() => store.saveServiceCatalogItem({ id: service.id, basePrice: -1 }), /importe|Importe|0/);
  assert.throws(() => store.saveServiceCatalogItem({ ...source, id: undefined, code: 'BAD-SVC', activityType: 'principal', isInstallationService: true }), /Secundaria/);
  store.deleteServiceCatalogItem(service.id);
});
test('fractional quantities, line discounts and taxes round consistently in cents', () => {
  const line: InvoiceLineItem = { ...base().items[0], quantity: 2.5, unitPrice: 19.99, discountPercent: 7.5, lineTotal: 999 };
  const totals = calculateInvoiceTotals([line], 10); assert.equal(totals.subtotal, 49.98); assert.equal(totals.discountTotal, 3.75); assert.equal(totals.items[0].lineTotal, 46.23); assert.equal(totals.taxAmount, 4.62); assert.equal(totals.total, 50.85);
  const invoice = store.saveInvoice({ ...base(), items: [line], total: 0, subtotal: 0 }); assert.equal(invoice.total, totals.total); assert.equal(invoice.items[0].lineTotal, 46.23);
});
test('failed invoices do not consume numbers; concurrent-style creation never duplicates IDs or numbers', () => {
  const sequence = store.getSupplierProfile().nextInvoiceSequence;
  assert.throws(() => store.saveInvoice({ ...base(), contractId: 'ctr-02' }), /no pertenece/); assert.equal(store.getSupplierProfile().nextInvoiceSequence, sequence);
  const created = Array.from({ length: 12 }, () => store.saveInvoice({ clientId: 'cli-01', status: 'borrador' }));
  assert.equal(new Set(created.map(i => i.id)).size, 12); assert.equal(new Set(created.map(i => i.invoiceNumber)).size, 12);
  created.forEach(i => store.deleteInvoice(i.id));
});
test('server validation rejects malformed dates, prices, scopes, tax and contract currency', () => {
  assert.throws(() => store.saveInvoice({ ...base(), issueDate: '2026-02-30' }), /fecha/);
  assert.throws(() => store.saveInvoice({ ...base(), taxRate: 101 }), /100/);
  assert.throws(() => store.saveInvoice({ ...base(), items: [{ ...base().items[0], quantity: -1 }] }), /cantidad/);
  assert.throws(() => store.saveInvoice({ ...base(), currency: 'EUR' }), /moneda/);
  assert.throws(() => store.saveInvoice({ ...base(), activityScope: 'principal' }), /alcance/);
  assert.throws(() => store.saveInvoice({ ...base(), contractId: '' }), /contrato/);
  assert.throws(() => store.saveInvoice({ ...base(), dueDate: '2026-11-01' }), /vencimiento/);
  assert.throws(() => store.saveInvoice({ ...base(), items: [] }), /servicio/);
});
test('generic updates cannot manufacture a client signature', () => {
  assert.throws(() => store.saveInvoice({ ...base(), clientSignatureDataUrl: createSampleSignatureDataUrl('client') }), /proceso de firma/);
  assert.throws(() => store.saveInvoice({ ...base(), signatureStatus: 'firmada_cliente' }), /proceso de firma/);
});
test('PNG validation checks magic, dimensions, CRC, decoding and real visible ink', () => {
  assertValidSignature(createSampleSignatureDataUrl('client'), true);
  assert.throws(() => assertValidSignature('data:image/png;base64,bm90LWEtcG5n'), /PNG|Cabecera/);
  const blank = PNG.sync.write(new PNG({ width: 100, height: 60 })); assert.throws(() => assertValidSignature(`data:image/png;base64,${blank.toString('base64')}`, true), /vacía/);
  const truncated = Buffer.from(createSampleSignatureDataUrl().split(',')[1], 'base64').subarray(0, 50); assert.throws(() => assertValidSignature(`data:image/png;base64,${truncated.toString('base64')}`), /leer/);
});
test('signature requires identity, explicit consent, an issued contract and a current revision', () => {
  const invoice = store.saveInvoice(base()); const payload = { clientSignerName: 'Cliente Prueba', clientSignerId: 'ID-TEST', clientSignerRole: 'Director', clientSignatureDataUrl: createSampleSignatureDataUrl('client'), consent: true, expectedUpdatedAt: invoice.updatedAt };
  assert.throws(() => store.signInvoiceByClient(invoice.id, { ...payload, consent: false }), /aceptar/);
  assert.throws(() => store.signInvoiceByClient(invoice.id, { ...payload, clientSignerName: '' }), /obligatorio/);
  assert.throws(() => store.signInvoiceByClient(invoice.id, { ...payload, expectedUpdatedAt: 'stale' }), /cambió/);
  const draft = store.saveInvoice({ clientId: 'cli-01', status: 'borrador' }); assert.throws(() => store.signInvoiceByClient(draft.id, { ...payload, expectedUpdatedAt: draft.updatedAt }), /borradores/); store.deleteInvoice(draft.id);
  const signed = store.signInvoiceByClient(invoice.id, payload); assert.equal(signed.signatureStatus, 'firmada_cliente'); assert.ok(signed.clientSignedAt); assert.match(signed.signatureDocumentHash!, /^[a-f0-9]{64}$/);
  assert.throws(() => store.signInvoiceByClient(invoice.id, { ...payload, expectedUpdatedAt: signed.updatedAt }), /sobrescribirse/);
  assert.throws(() => store.saveInvoice({ ...signed, notes: 'Cambio ilegal' }), /protegido/);
  assert.throws(() => store.deleteInvoice(invoice.id), /borradores/);
  const originalClientName = signed.client!.name, originalOwner = signed.supplier!.ownerName, originalClause = signed.contract!.acceptanceClause;
  store.saveClient({ id: 'cli-01', name: 'Nuevo nombre que no debe alterar la factura firmada' }); store.updateSupplierProfile({ ownerName: 'Otro titular' }); store.saveContract({ id: 'ctr-01', acceptanceClause: 'Otra cláusula para futuras facturas.' });
  const unchanged = store.getInvoiceById(invoice.id)!; assert.equal(unchanged.client!.name, originalClientName); assert.equal(unchanged.supplier!.ownerName, originalOwner); assert.equal(unchanged.contract!.acceptanceClause, originalClause); assert.equal(store.getInvoiceIntegrity(invoice.id).matches, true);
  store.updateInvoiceStatus(invoice.id, 'pagada'); assert.equal(store.getInvoiceIntegrity(invoice.id).matches, true); assert.equal(store.getInvoiceIntegrity(invoice.id).consent.accepted, true);
  assert.deepEqual(store.getInvoiceEvents(invoice.id).map(e => e.type), ['created', 'client_signed', 'status_changed']);
  assert.throws(() => store.updateInvoiceStatus(invoice.id, 'borrador'), /borrador/);
  store.updateInvoiceStatus(invoice.id, 'anulada'); assert.throws(() => store.updateInvoiceStatus(invoice.id, 'emitida'), /reactivar/);
});
test('stored invoices remain available through another SQLite connection', () => {
  const connection = new DatabaseSync(path.join(directory, 'facturacion.sqlite'), { readOnly: true }); const count = connection.prepare('SELECT COUNT(*) AS count FROM invoices').get() as { count: number }; assert.ok(count.count >= 3); connection.close();
});


test('a full discount cannot bypass gross-amount bounds', () => {
  const source = base(); const item = { ...source.items[0], quantity: 1000000, unitPrice: 999999999, discountPercent: 100 };
  assert.throws(() => store.saveInvoice({ clientId: source.clientId, items: [item], status: 'borrador' }), /límite/);
});

test('issued content is immutable even before client signature; payment state remains changeable', () => { const invoice=store.saveInvoice(base()); assert.throws(()=>store.saveInvoice({...invoice,notes:'Rewrite after issuance'}),/emitida conserva/); assert.equal(store.updateInvoiceStatus(invoice.id,'pagada').status,'pagada'); });
