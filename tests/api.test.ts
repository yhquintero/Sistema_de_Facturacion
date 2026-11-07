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
let server: http.Server, origin: string, adminCookie = '';
const password = randomBytes(24).toString('hex');
before(async () => {
  server = http.createServer(createApp({ password, allowSetup: false })); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const login = await fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexo-Request': '1' }, body: JSON.stringify({ username: 'admin', password }) }); assert.equal(login.status, 200); adminCookie = login.headers.get('set-cookie')!.split(';')[0];
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const request = (url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(`${origin}${url}`, { method, headers: { 'Content-Type': 'application/json', 'X-Nexo-Request': '1', Cookie: adminCookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

test('health, standards, JSON 404 and same-origin write protection', async () => {
  const response = await request('/api/health'); assert.equal(response.status, 200); assert.equal((await response.json()).paperStandards.length, 10); assert.equal(response.headers.get('cache-control'), 'no-store');
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
test('APP_PASSWORD bootstraps an admin account; per-user sessions protect documents and exports with HttpOnly cookies', async () => {
  assert.equal((await fetch(`${origin}/api/health`)).status, 200);
  const session = await (await fetch(`${origin}/api/session`)).json(); assert.equal(session.protected, true); assert.equal(session.authenticated, false); assert.equal(session.user, null); assert.equal(session.setupAvailable, false);
  assert.equal((await fetch(`${origin}/api/invoices`)).status, 401); assert.equal((await fetch(`${origin}/api/invoices/inv-02/export/pdf`)).status, 401);
  const post = (body: unknown) => fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexo-Request': '1' }, body: JSON.stringify(body) });
  assert.equal((await post({ username: 'admin', password: 'incorrect' })).status, 401); assert.equal((await post({ username: 'nadie', password })).status, 401); assert.equal((await post({ password })).status, 401);
  assert.equal((await post({ username: 'admin', password: 'incorrect' })).headers.get('set-cookie'), null);
  const login = await post({ username: 'ADMIN', password }); assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie')!; assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const info = await login.json(); assert.equal(info.user.username, 'admin'); assert.equal(info.user.role, 'admin'); assert.ok(info.permissions.includes('users.manage'));
  const headers = { Cookie: cookie.split(';')[0] }; assert.equal((await fetch(`${origin}/api/clients`, { headers })).status, 200);
  assert.equal((await fetch(`${origin}/api/logout`, { method: 'POST', headers: { ...headers, 'X-Nexo-Request': '1' } })).status, 200); assert.equal((await fetch(`${origin}/api/clients`, { headers })).status, 401);
  assert.equal((await fetch(`${origin}/api/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexo-Request': '1' }, body: JSON.stringify({ username: 'intruso', displayName: 'X', password: 'una-clave-muy-larga' }) })).status, 409);
});
test('revenue goals are validated per currency, rounded, persisted and cleared when zero', async () => {
  assert.deepEqual(await (await request('/api/goals')).json(), {});
  assert.equal((await request('/api/goals', 'PUT', { USD: { monthly: -5, yearly: 0 } })).status, 400);
  assert.equal((await request('/api/goals', 'PUT', { XYZ: { monthly: 5, yearly: 0 } })).status, 400);
  assert.equal((await request('/api/goals', 'PUT', { USD: { monthly: 100, yearly: 1200, extra: 1 } })).status, 400);
  const saved = await request('/api/goals', 'PUT', { USD: { monthly: 3000.456, yearly: 36000 }, EUR: { monthly: 0, yearly: 0 } }); assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { USD: { monthly: 3000.46, yearly: 36000 } });
  assert.deepEqual(await (await request('/api/goals')).json(), { USD: { monthly: 3000.46, yearly: 36000 } });
  assert.deepEqual(await (await request('/api/goals', 'PUT', { USD: { monthly: 0, yearly: 0 } })).json(), {});
});

