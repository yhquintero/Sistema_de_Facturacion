import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSampleSignatureDataUrl } from '../server/utils/signaturePng';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-users-')); process.env.DATA_DIR = directory; process.env.SEED_DEMO = 'true';
const { createApp } = await import('../server/app'); const { db, getInvoiceById } = await import('../server/db');
let server: http.Server, origin: string;
before(async () => { server = http.createServer(createApp({ password: '', allowSetup: true })); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; });
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

type Call = { status: number; body: any; cookie: string };
async function call(url: string, method = 'GET', body?: unknown, cookie = ''): Promise<Call> {
  const csrfToken = cookie && !['GET','HEAD','OPTIONS'].includes(method) ? (await (await fetch(`${origin}/api/session`, {headers:{Cookie:cookie}})).json()).csrfToken || '' : '';
  const response = await fetch(`${origin}${url}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie, 'X-CSRF-Token':csrfToken } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let parsed: any = text; try { parsed = JSON.parse(text); } catch { /* binary */ }
  return { status: response.status, body: parsed, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}
const login = async (username: string, password: string) => { const result = await call('/api/login', 'POST', { username, password }); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.cookie; };
const ADMIN_PASSWORD = 'administra-con-calma-2026';
let admin = '';
const ids: Record<string, string> = {};

test('open mode works without accounts, cannot manage users, and the setup wizard creates the first administrator', async () => {
  const session = await call('/api/session');
  assert.equal(session.body.protected, false); assert.equal(session.body.authenticated, true); assert.equal(session.body.setupAvailable, true);
  assert.ok(!session.body.permissions.includes('users.manage')); assert.ok(session.body.permissions.includes('invoices.issue'));
  assert.equal((await call('/api/clients')).status, 200);
  assert.equal((await call('/api/users')).status, 403);
  assert.equal((await call('/api/users', 'POST', { username: 'colado', displayName: 'X', role: 'admin', password: 'una-clave-bastante-larga' })).status, 403);
  assert.equal((await call('/api/setup', 'POST', { username: 'ana', displayName: 'Ana', password: 'corta' })).status, 400);
  const setup = await call('/api/setup', 'POST', { username: 'Ana.Admin', displayName: 'Ana Administradora', password: ADMIN_PASSWORD });
  assert.equal(setup.status, 201, JSON.stringify(setup.body)); assert.equal(setup.body.user.username, 'ana.admin'); assert.equal(setup.body.user.role, 'admin'); assert.ok(setup.cookie);
  admin = setup.cookie;
  assert.equal((await call('/api/session')).body.protected, true);
  assert.equal((await call('/api/clients')).status, 401, 'once an account exists, anonymous access stops');
  assert.equal((await call('/api/setup', 'POST', { username: 'otra', displayName: 'Otra', password: ADMIN_PASSWORD })).status, 409);
  assert.equal((await call('/api/users', 'GET', undefined, admin)).status, 200);
});

test('administrators create accounts with validated, hashed passwords and unique usernames', async () => {
  for (const [username, role] of [['gema', 'gestor'], ['tomas', 'tecnico'], ['lucia', 'lectura']] as const) {
    const created = await call('/api/users', 'POST', { username, displayName: username.toUpperCase(), role, password: `clave-de-${username}-segura`, mustChangePassword: false }, admin);
    assert.equal(created.status, 201, JSON.stringify(created.body)); assert.equal(created.body.role, role); assert.equal(created.body.passwordHash, undefined); ids[username] = created.body.id;
  }
  assert.equal((await call('/api/users', 'POST', { username: 'GEMA', displayName: 'Duplicada', role: 'gestor', password: 'otra-clave-bastante-larga' }, admin)).status, 400);
  assert.equal((await call('/api/users', 'POST', { username: 'débil', displayName: 'X', role: 'gestor', password: 'otra-clave-bastante-larga' }, admin)).status, 400);
  assert.equal((await call('/api/users', 'POST', { username: 'corta', displayName: 'X', role: 'gestor', password: '12345' }, admin)).status, 400);
  assert.equal((await call('/api/users', 'POST', { username: 'superusuario', displayName: 'X', role: 'root', password: 'otra-clave-bastante-larga' }, admin)).status, 400);
  const rows = db.prepare('SELECT username, password_hash FROM users').all() as { username: string; password_hash: string }[];
  for (const row of rows) { assert.match(row.password_hash, /^scrypt\$32768\$8\$1\$/); assert.ok(!row.password_hash.includes(row.username)); }
  const listed = (await call('/api/users', 'GET', undefined, admin)).body; assert.equal(listed.length, 4); assert.ok(listed.every((u: Record<string, unknown>) => !('passwordHash' in u) && !('password_hash' in u)));
  const token = admin.split('=')[1]; assert.equal(db.prepare('SELECT 1 FROM user_sessions WHERE token_hash=?').get(token), undefined, 'session tokens are only stored as hashes');
});

test('read-only users can consult and export but every write is rejected by the server', async () => {
  const lucia = await login('lucia', 'clave-de-lucia-segura');
  assert.equal((await call('/api/invoices', 'GET', undefined, lucia)).status, 200);
  assert.equal((await call('/api/invoices/inv-02/export/pdf', 'GET', undefined, lucia)).status, 200);
  const invoice = getInvoiceById('inv-01')!;
  for (const [url, method, body] of [
    ['/api/clients', 'POST', { code: 'RO-1', name: 'No' }], ['/api/clients/cli-01', 'PUT', { city: 'X' }], ['/api/contracts/ctr-01', 'DELETE', undefined],
    ['/api/catalog', 'POST', {}], ['/api/supplier', 'PUT', { city: 'X' }], ['/api/invoices', 'POST', { clientId: 'cli-01' }],
    ['/api/invoices/inv-01/status', 'PATCH', { status: 'pagada' }], ['/api/invoices/inv-01/sign', 'POST', { expectedUpdatedAt: invoice.updatedAt }], ['/api/users', 'GET', undefined],
  ] as const) {
    const result = await call(url, method, body, lucia); assert.equal(result.status, 403, `${method} ${url}`); assert.match(result.body.error, /Solo lectura/);
  }
  assert.equal(getInvoiceById('inv-01')!.status, invoice.status);
});

test('technicians prepare drafts and capture signatures, but cannot issue, collect, delete or manage master data', async () => {
  const tomas = await login('tomas', 'clave-de-tomas-segura');
  const session = (await call('/api/session', 'GET', undefined, tomas)).body; assert.equal(session.user.role, 'tecnico'); assert.deepEqual(session.permissions, ['invoices.draft', 'invoices.sign']);
  const line = { id: 'l1', code: 'SOP', activityType: 'secundaria', category: 'Soporte', title: 'Instalación en sitio', description: '', unit: 'Servicio', quantity: 1, unitPrice: 50, discountPercent: 0 };
  const draft = await call('/api/invoices', 'POST', { clientId: 'cli-01', contractId: 'ctr-01', items: [line], status: 'borrador' }, tomas); assert.equal(draft.status, 201, JSON.stringify(draft.body));
  assert.equal((await call(`/api/invoices/${draft.body.id}`, 'PUT', { clientId: 'cli-01', notes: 'Equipo revisado', updatedAt: draft.body.updatedAt }, tomas)).status, 200);
  assert.equal((await call(`/api/invoices/${draft.body.id}`, 'PUT', { clientId: 'cli-01', status: 'emitida' }, tomas)).status, 403);
  assert.equal((await call('/api/invoices', 'POST', { clientId: 'cli-01', items: [line], status: 'emitida' }, tomas)).status, 403);
  assert.equal((await call(`/api/invoices/${draft.body.id}/status`, 'PATCH', { status: 'anulada' }, tomas)).status, 403);
  assert.equal((await call(`/api/invoices/${draft.body.id}`, 'DELETE', undefined, tomas)).status, 403);
  assert.equal((await call('/api/invoices/inv-02', 'PUT', { clientId: 'cli-02', notes: 'Cambio sobre emitida' }, tomas)).status, 403, 'issued invoices need invoices.issue');
  assert.equal((await call('/api/clients', 'POST', { code: 'T-1', name: 'No' }, tomas)).status, 403);
  const invoice = getInvoiceById('inv-01')!;
  const signed = await call('/api/invoices/inv-01/sign', 'POST', { clientSignerName: 'Persona Autorizada', clientSignerId: 'ID-1', clientSignerRole: 'Directora', clientSignatureDataUrl: createSampleSignatureDataUrl('client'), consent: true, expectedUpdatedAt: invoice.updatedAt }, tomas);
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  const events = (await call('/api/invoices/inv-01/events', 'GET', undefined, tomas)).body; const signEvent = events.find((e: { type: string }) => e.type === 'client_signed');
  assert.equal(signEvent.actorId, ids.tomas); assert.equal(signEvent.actorName, 'TOMAS');
  const created = (await call(`/api/invoices/${draft.body.id}/events`, 'GET', undefined, tomas)).body[0]; assert.equal(created.actorName, 'TOMAS');
});

test('billing managers handle clients, contracts and collection status, but not the supplier profile or accounts', async () => {
  const gema = await login('gema', 'clave-de-gema-segura');
  const client = await call('/api/clients', 'POST', { code: 'GES-1', name: 'Cliente de la gestora' }, gema); assert.equal(client.status, 201);
  assert.equal((await call(`/api/clients/${client.body.id}`, 'DELETE', undefined, gema)).status, 200);
  assert.equal((await call('/api/invoices/inv-01/status', 'PATCH', { status: 'pagada' }, gema)).status, 200);
  assert.equal((await call('/api/supplier', 'PUT', { city: 'Otra' }, gema)).status, 403);
  assert.equal((await call('/api/goals', 'GET', undefined, gema)).status, 200); assert.equal((await call('/api/goals', 'PUT', { USD: { monthly: 1, yearly: 12 } }, gema)).status, 403);
  assert.equal((await call('/api/users', 'GET', undefined, gema)).status, 403);
  assert.equal((await call('/api/security-events', 'GET', undefined, gema)).status, 403);
});

test('role changes apply immediately; deactivation ends sessions; administrators cannot lock themselves out', async () => {
  const lucia = await login('lucia', 'clave-de-lucia-segura');
  assert.equal((await call('/api/clients', 'POST', { code: 'PROMO-1', name: 'Antes' }, lucia)).status, 403);
  assert.equal((await call(`/api/users/${ids.lucia}`, 'PUT', { role: 'gestor' }, admin)).status, 200);
  assert.equal((await call('/api/clients', 'POST', { code: 'PROMO-1', name: 'Después de la promoción' }, lucia)).status, 201, 'the new role is effective without signing in again');
  assert.equal((await call(`/api/users/${ids.lucia}`, 'PUT', { active: false }, admin)).status, 200);
  assert.equal((await call('/api/clients', 'GET', undefined, lucia)).status, 401);
  const blocked = await call('/api/login', 'POST', { username: 'lucia', password: 'clave-de-lucia-segura' }); assert.equal(blocked.status, 403); assert.match(blocked.body.error, /desactivada/);
  const me = (await call('/api/session', 'GET', undefined, admin)).body.user;
  assert.equal((await call(`/api/users/${me.id}`, 'PUT', { role: 'lectura' }, admin)).status, 400);
  assert.equal((await call(`/api/users/${me.id}`, 'PUT', { active: false }, admin)).status, 400);
  assert.equal((await call(`/api/users/${me.id}`, 'PUT', { password: 'nueva-clave-sin-verificar' }, admin)).status, 400);
  assert.equal((await call(`/api/users/${ids.gema}`, 'PUT', { role: 'admin' }, admin)).status, 200);
  const gema = await login('gema', 'clave-de-gema-segura');
  assert.equal((await call(`/api/users/${me.id}`, 'PUT', { role: 'gestor' }, gema)).status, 200, 'another admin can demote while one admin remains');
  assert.equal((await call(`/api/users/${ids.gema}`, 'PUT', { role: 'gestor' }, gema)).status, 400, 'the last admin cannot demote themselves');
  assert.equal((await call(`/api/users/${me.id}`, 'PUT', { role: 'admin' }, gema)).status, 200);
});

test('temporary passwords force a change before any other action and revoke older sessions', async () => {
  const reset = await call(`/api/users/${ids.tomas}`, 'PUT', { password: 'temporal-para-tomas' }, admin); assert.equal(reset.status, 200); assert.equal(reset.body.mustChangePassword, true);
  const first = await call('/api/login', 'POST', { username: 'tomas', password: 'temporal-para-tomas' }); assert.equal(first.status, 200); assert.equal(first.body.user.mustChangePassword, true);
  const tomas = first.cookie; const second = await login('tomas', 'temporal-para-tomas');
  const blocked = await call('/api/invoices', 'GET', undefined, tomas); assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await call('/api/me/password', 'PUT', { currentPassword: 'incorrecta', newPassword: 'definitiva-de-tomas' }, tomas)).status, 400);
  assert.equal((await call('/api/me/password', 'PUT', { currentPassword: 'temporal-para-tomas', newPassword: 'corta' }, tomas)).status, 400);
  const changed = await call('/api/me/password', 'PUT', { currentPassword: 'temporal-para-tomas', newPassword: 'definitiva-de-tomas' }, tomas); assert.equal(changed.status, 200); assert.equal(changed.body.user.mustChangePassword, false);
  assert.equal((await call('/api/invoices', 'GET', undefined, tomas)).status, 200);
  assert.equal((await call('/api/invoices', 'GET', undefined, second)).status, 401, 'other sessions are closed after a password change');
  assert.equal((await call('/api/login', 'POST', { username: 'tomas', password: 'temporal-para-tomas' })).status, 401);
  assert.equal((await call(`/api/users/${ids.tomas}/sessions`, 'DELETE', undefined, admin)).body.revoked, 1);
  assert.equal((await call('/api/invoices', 'GET', undefined, tomas)).status, 401);
});

test('security log records sign-ins, failures and account administration without storing passwords', async () => {
  const events = (await call('/api/security-events?limit=200', 'GET', undefined, admin)).body as { type: string; targetName: string; details: object }[];
  const types = new Set(events.map(e => e.type));
  for (const type of ['setup_admin', 'user_created', 'login_succeeded', 'login_failed', 'role_changed', 'user_deactivated', 'password_reset', 'password_changed', 'password_change_failed', 'sessions_revoked']) assert.ok(types.has(type), type);
  assert.ok(!JSON.stringify(events).includes('clave-de-'), 'passwords never reach the log');
  assert.ok(!JSON.stringify(events).includes('temporal-para-tomas'));
});

test('fiscal and operational routes enforce personal roles even with a valid CSRF token', async () => {
  const credentials: Record<string,string> = {};
  for (const role of ['gestor','tecnico','lectura'] as const) {
    const username=`fiscal.${role}`, password=`PUBLIC-FISCAL-FIXTURE-${role}-2026`;
    assert.equal((await call('/api/users','POST',{username,displayName:`Fixture ${role}`,role,password,mustChangePassword:false},admin)).status,201);
    credentials[role]=await login(username,password);
  }
  for(const role of ['gestor','lectura']) assert.equal((await call('/api/fiscal/report?year=2026','GET',undefined,credentials[role])).status,200);
  assert.equal((await call('/api/fiscal/report?year=2026','GET',undefined,credentials.tecnico)).status,403);
  for(const role of ['gestor','tecnico','lectura']) assert.equal((await call('/api/goals','PUT',{CUP:{monthly:1000,yearly:12000}},credentials[role])).status,403);
  assert.equal((await call('/api/goals','PUT',{CUP:{monthly:1000,yearly:12000}},admin)).status,200);
  assert.equal((await call('/api/security/status','GET',undefined,credentials.gestor)).status,403);
  assert.equal((await call('/api/security/status','GET',undefined,admin)).body.authentication.multiuser,true);
  const input={occurredOn:'2026-01-15',kind:'income',description:'Cobro de fixture de permisos fiscales',originalAmount:5,currency:'CUP',exchangeRate:1,exchangeRateSource:'',exchangeRateDate:'',evidenceReference:'FIXTURE-ONLY-FISCAL',documented:true,taxCode:'',invoiceId:'',deductibility:'not_deductible',classificationBasis:'',idempotencyKey:crypto.randomUUID()};
  for(const role of ['tecnico','lectura']) {
    assert.equal((await call('/api/fiscal/entries','POST',input,credentials[role])).status,403);
    assert.equal((await call('/api/fiscal/profile','PUT',{},credentials[role])).status,403);
  }
  const created=await call('/api/fiscal/entries','POST',input,credentials.gestor); assert.equal(created.status,201,JSON.stringify(created.body));
  assert.equal((await call('/api/fiscal/export/csv?year=2026','GET',undefined,credentials.lectura)).status,200);
  assert.equal((await call(`/api/fiscal/entries/${created.body.id}/reverse`,'POST',{occurredOn:'2026-01-16',reason:'Reversión de fixture fiscal',idempotencyKey:crypto.randomUUID()},credentials.lectura)).status,403);
  assert.equal((await call(`/api/fiscal/entries/${created.body.id}/reverse`,'POST',{occurredOn:'2026-01-16',reason:'Reversión de fixture fiscal',idempotencyKey:crypto.randomUUID()},credentials.gestor)).status,201);
});

test('existing PR #2 scrypt credentials remain usable and bootstrap settings do not overwrite accounts', async () => {
  const {randomBytes,scryptSync}=await import('node:crypto');
  const password='PUBLIC-LEGACY-FIXTURE-CONTRASEÑA-2026',salt=randomBytes(16);
  const created=await call('/api/users','POST',{username:'legacy.account',displayName:'Fixture legado',role:'lectura',password,mustChangePassword:false},admin);assert.equal(created.status,201);
  const encoded=`scrypt$16384$8$1$${salt.toString('base64')}$${scryptSync(password.normalize('NFKC'),salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('base64')}`;
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded,created.body.id);
  const before=db.prepare('SELECT COUNT(*) AS n FROM users').get()?.n;
  createApp({password:'OTHER-BOOTSTRAP-FIXTURE-NOT-AN-OVERRIDE'});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get()?.n,before);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id=?').get(created.body.id)?.password_hash,encoded);
  const session=await login('legacy.account',password); assert.equal((await call('/api/invoices','GET',undefined,session)).status,200);
  const changed=await call('/api/me/password','PUT',{currentPassword:password,newPassword:'PUBLIC-NEW-FIXTURE-PASSWORD-2026'},session);assert.equal(changed.status,200);
  assert.match(String(db.prepare('SELECT password_hash FROM users WHERE id=?').get(created.body.id)?.password_hash),/^scrypt\$32768\$8\$1\$/);
});

test('account administration requires the CSRF token of the same authenticated session', async () => {
  const other=await login('legacy.account','PUBLIC-NEW-FIXTURE-PASSWORD-2026');
  const otherCsrf=(await call('/api/session','GET',undefined,other)).body.csrfToken;
  const before=db.prepare('SELECT display_name FROM users WHERE id=?').get(ids.gema)?.display_name;
  for(const token of ['',otherCsrf]) {
    const result=await fetch(`${origin}/api/users/${ids.gema}`,{method:'PUT',headers:{Cookie:admin,'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({displayName:'CSRF MUST NOT CHANGE THIS'})});
    assert.equal(result.status,403);assert.match((await result.json()).error,/Token de seguridad/);
  }
  assert.equal(db.prepare('SELECT display_name FROM users WHERE id=?').get(ids.gema)?.display_name,before);
});

test('a successful login to another account cannot reset the target account brute-force limit',async()=>{
  for(let i=0;i<9;i++)assert.equal((await call('/api/login','POST',{username:'legacy.account',password:'WRONG-PUBLIC-FIXTURE'})).status,401);
  await login('fiscal.gestor','PUBLIC-FISCAL-FIXTURE-gestor-2026');
  assert.equal((await call('/api/login','POST',{username:'legacy.account',password:'WRONG-PUBLIC-FIXTURE'})).status,401);
  assert.equal((await call('/api/login','POST',{username:'legacy.account',password:'WRONG-PUBLIC-FIXTURE'})).status,429);
});
