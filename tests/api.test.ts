import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createSampleSignatureDataUrl } from '../server/utils/signaturePng';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-api-')); process.env.DATA_DIR = directory; process.env.SEED_DEMO = 'true';
const { createApp } = await import('../server/app'); const { db, getInvoiceById } = await import('../server/db');
let server: http.Server, protectedServer: http.Server, origin: string, protectedOrigin: string;
const password = randomBytes(24).toString('hex');
before(async () => { server = http.createServer(createApp({ password: '' })); protectedServer = http.createServer(createApp({ password })); await Promise.all([new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)), new Promise<void>(resolve => protectedServer.listen(0, '127.0.0.1', resolve))]); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; protectedOrigin = `http://127.0.0.1:${(protectedServer.address() as { port: number }).port}`; });
after(async () => { await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => protectedServer.close(() => resolve()))]); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const request = (url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(`${origin}${url}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

test('health, standards, JSON 404 and same-origin write protection', async () => {
  const response = await request('/api/health'); assert.equal(response.status, 200); assert.equal((await response.json()).ok, true); assert.equal((await (await request('/api/paper-standards')).json()).length, 10); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await request('/api/does-not-exist')).status, 404); assert.equal((await request('/api/invoices/missing')).status, 404);
  assert.equal((await request('/api/clients', 'POST', { name: 'Evil', code: 'EVIL' }, { Origin: 'https://other.invalid' })).status, 403);
});
test('CRUD accepts partial updates, rejects malformed records and protects linked data', async () => {
  assert.equal((await request('/api/clients', 'POST', {})).status, 400);
  const created = await request('/api/clients', 'POST', { code: 'HTTP-TEST', name: 'Cliente HTTP' }); assert.equal(created.status, 201); const client = await created.json();
  const update = await request(`/api/clients/${client.id}`, 'PUT', { city: 'Ciudad nueva' }); assert.equal(update.status, 200); assert.equal((await update.json()).name, 'Cliente HTTP');
  assert.equal((await request(`/api/clients/${client.id}`, 'DELETE')).status, 200); assert.equal((await request('/api/clients/cli-01', 'DELETE')).status, 409);
  assert.equal((await request('/api/contracts/ctr-01', 'DELETE')).status, 400); assert.equal((await request('/api/invoices/inv-02', 'DELETE')).status, 400);
});
test('exports use correct MIME types and names, reject invalid paper and orientation', async () => {
  for (const [format, mime] of [['pdf', 'application/pdf'], ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]) {
    const response = await request(`/api/invoices/inv-01/export/${format}?paper=A4&orientation=landscape`); assert.equal(response.status, 200, await response.clone().text()); assert.match(response.headers.get('content-type')!, new RegExp(mime.replace(/[.+]/g, '\\$&'))); assert.match(response.headers.get('content-disposition')!, new RegExp(`A4_Horizontal\\.${format}`)); const bytes = new Uint8Array(await response.arrayBuffer()); assert.ok(bytes.length > 1000); assert.equal(String.fromCharCode(...bytes.slice(0, 2)), format === 'pdf' ? '%P' : 'PK');
  }
  assert.equal((await request('/api/invoices/inv-01/export/pdf?paper=INVALID')).status, 400); assert.equal((await request('/api/invoices/inv-01/export/pdf?orientation=sideways')).status, 400); assert.equal((await request('/api/invoices/inv-01/export/txt')).status, 400);
  assert.match((await request('/api/invoices/inv-01/export/pdf?inline=1')).headers.get('content-disposition')!, /^inline/);
});
test('signing persists consent; raw updates cannot bypass the immutable document', async () => {
  const invoice = getInvoiceById('inv-01')!;
  assert.equal((await request('/api/invoices/inv-01/sign', 'POST', {})).status, 400);
  const response = await request('/api/invoices/inv-01/sign', 'POST', { clientSignerName: 'Persona Autorizada', clientSignerId: 'ID-HTTP', clientSignerRole: 'Director', clientSignatureDataUrl: createSampleSignatureDataUrl('client'), consent: true, expectedUpdatedAt: invoice.updatedAt }); assert.equal(response.status, 200); assert.equal((await response.json()).signatureStatus, 'firmada_cliente');
  const integrity = await (await request('/api/invoices/inv-01/integrity')).json(); assert.equal(integrity.matches, true); assert.equal(integrity.consent.accepted, true);
  assert.equal((await request('/api/invoices/inv-01', 'PUT', { ...invoice, total: 0 })).status, 400);
  assert.equal((await request('/api/invoices/inv-01/status', 'PATCH', { status: 'invalid' })).status, 400);
  assert.equal((await request('/api/invoices/inv-01/status', 'PATCH', { status: 'pagada' })).status, 200);
  assert.equal((await (await request('/api/invoices/inv-01/integrity')).json()).matches, true);
  db.prepare("UPDATE invoices SET notes='Manipulación fuera de la aplicación' WHERE id='inv-01'").run();
  assert.equal((await (await request('/api/invoices/inv-01/integrity')).json()).matches, false);
  assert.equal((await request('/api/invoices/inv-01/export/pdf')).status, 409);
});
test('optional password sessions protect all documents and exports with HttpOnly cookies', async () => {
  assert.equal((await fetch(`${protectedOrigin}/api/health`)).status, 200);
  const session = await (await fetch(`${protectedOrigin}/api/session`)).json(); assert.equal(session.protected, true); assert.equal(session.authenticated, false);
  assert.equal((await fetch(`${protectedOrigin}/api/invoices`)).status, 401); assert.equal((await fetch(`${protectedOrigin}/api/invoices/inv-02/export/pdf`)).status, 401);
  const bad = await fetch(`${protectedOrigin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'incorrect' }) }); assert.equal(bad.status, 401);
  const login = await fetch(`${protectedOrigin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie')!; assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const loggedIn = await (await fetch(`${protectedOrigin}/api/session`, { headers: { Cookie: cookie.split(';')[0] } })).json();
  const headers = { Cookie: cookie.split(';')[0], 'X-CSRF-Token': loggedIn.csrfToken }; assert.equal((await fetch(`${protectedOrigin}/api/clients`, { headers })).status, 200);
  assert.equal((await fetch(`${protectedOrigin}/api/logout`, { method: 'POST', headers })).status, 200); assert.equal((await fetch(`${protectedOrigin}/api/clients`, { headers })).status, 401);
});
