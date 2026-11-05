import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-empty-')); process.env.DATA_DIR = directory; process.env.SEED_DEMO = 'false';
const store = await import('../server/db');
after(() => { store.db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
test('an empty production installation never fabricates clients, contracts, invoices, taxes or signatures', () => {
  assert.equal(store.getWorkspaceInfo().demo, false); assert.equal(store.listClients().length, 0); assert.equal(store.listContracts().length, 0); assert.equal(store.listInvoices().length, 0);
  const supplier = store.getSupplierProfile(); assert.equal(supplier.defaultTaxRate, 0); assert.equal(supplier.taxId, ''); assert.equal(supplier.supplierSignatureDataUrl, ''); assert.equal(supplier.nextInvoiceSequence, 1); assert.equal(store.listServiceCatalog().length, 12); assert.equal(store.getDashboardStats().totalInvoices, 0);
});
