import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Contract, Invoice } from '../shared/types';
import { buildAlerts, daysBetween, summarizeAlerts } from '../src/lib/alerts';
import { computeKpis, goalProgress, monthlySeries, percentChange, periodElapsed, receivablesAging, topClients } from '../src/lib/analytics';
import { fold, highlight, matches, score } from '../src/lib/search';
import { nextTheme, resolveTheme, isTextSize, isThemeMode } from '../src/lib/preferences';
import { darkVariant, format, parseColor, themeCss } from '../scripts/theme-colors';

const inv = (over: Partial<Invoice>): Invoice => ({ id: 'i', invoiceNumber: 'FAC-1', issueDate: '2026-11-01', dueDate: '2026-11-15', status: 'emitida', signatureStatus: 'firmada_cliente', clientId: 'c1', contractId: 'k1', activityScope: 'principal', currency: 'USD', items: [], installationBlocks: [], subtotal: 0, discountTotal: 0, taxName: '', taxRate: 0, taxAmount: 0, total: 100, paymentMethod: '', serviceModality: '', serviceLocation: '', warrantyNotes: '', notes: '', acceptanceStatement: '', clientSignerName: '', clientSignerId: '', clientSignerRole: '', clientSignedAt: '', clientSignatureDataUrl: '', supplierSignatureDataUrl: '', preferredPaperSize: 'A4', preferredOrientation: 'portrait', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', client: { name: 'Acme' } as Invoice['client'], ...over });
const ctr = (over: Partial<Contract>): Contract => ({ id: 'k', contractNumber: 'CTR-1', clientId: 'c1', clientName: 'Acme', title: 'Soporte', activityScope: 'principal', startDate: '2026-01-01', endDate: '2026-12-31', status: 'vigente', currency: 'USD', contractValue: 0, paymentTerms: '', deliveryModality: '', warrantyDaysSoftware: 0, warrantyDaysSupport: 0, ...over } as Contract);

test('alerts flag overdue, due-soon, unsigned, stale drafts and ending contracts, most urgent first', () => {
  assert.equal(daysBetween('2026-11-01', '2026-11-08'), 7); assert.equal(daysBetween('2026-03-31', '2026-03-29'), -2);
  const alerts = buildAlerts([
    inv({ id: 'a', invoiceNumber: 'FAC-A', dueDate: '2026-11-01', total: 250 }),
    inv({ id: 'b', invoiceNumber: 'FAC-B', dueDate: '2026-11-10', signatureStatus: 'pendiente_firma' }),
    inv({ id: 'c', invoiceNumber: 'FAC-C', status: 'pagada', dueDate: '2026-01-01' }),
    inv({ id: 'd', invoiceNumber: 'FAC-D', status: 'borrador', updatedAt: '2026-10-01T00:00:00Z', signatureStatus: 'pendiente_firma' }),
    inv({ id: 'e', invoiceNumber: 'FAC-E', status: 'anulada', dueDate: '2026-01-01', signatureStatus: 'pendiente_firma' }),
  ], [ctr({ id: 'k1', endDate: '2026-11-20' }), ctr({ id: 'k2', contractNumber: 'CTR-2', endDate: '2026-10-01' }), ctr({ id: 'k3', status: 'finalizado', endDate: '2026-10-01' })], { today: '2026-11-07' });
  assert.deepEqual(alerts.map(a => a.id), ['overdue-a', 'cexp-k2', 'sign-b', 'due-b', 'cend-k1', 'draft-d']);
  assert.equal(alerts[0].title, 'FAC-A vencida hace 6 días'); assert.equal(alerts[0].severity, 'alta');
  assert.equal(alerts.find(a => a.id === 'due-b')!.title, 'FAC-B vence en 3 días');
  const summary = summarizeAlerts(alerts);
  assert.deepEqual({ ...summary, overdueByCurrency: summary.overdueByCurrency }, { total: 6, high: 1, overdue: 1, overdueByCurrency: { USD: 250 }, dueSoon: 1, signatures: 1, contracts: 2, drafts: 1 });
});

test('analytics never mix currencies and ignore drafts and void invoices', () => {
  const list = [
    inv({ id: '1', issueDate: '2026-11-02', total: 300, status: 'pagada' }),
    inv({ id: '2', issueDate: '2026-11-05', total: 200, dueDate: '2026-11-30' }),
    inv({ id: '3', issueDate: '2026-10-10', total: 400, dueDate: '2026-10-20', clientId: 'c2', client: { name: 'Beta' } as Invoice['client'] }),
    inv({ id: '4', issueDate: '2026-11-03', total: 999, status: 'borrador' }),
    inv({ id: '5', issueDate: '2026-11-03', total: 999, status: 'anulada' }),
    inv({ id: '6', issueDate: '2026-11-03', total: 777, currency: 'EUR' }),
    inv({ id: '7', issueDate: '2026-08-01', total: 50, dueDate: '2026-08-15' }),
  ];
  const series = monthlySeries(list, 'USD', 3, new Date('2026-11-07T12:00:00'));
  assert.deepEqual(series.map(p => [p.key, p.billed, p.paid, p.count]), [['2026-09', 0, 0, 0], ['2026-10', 400, 0, 1], ['2026-11', 500, 300, 2]]);
  const k = computeKpis(list, 'USD', '2026-11-07');
  assert.equal(k.thisMonth, 500); assert.equal(k.lastMonth, 400); assert.equal(k.change, 25); assert.equal(k.yearToDate, 950);
  assert.equal(k.bestMonth?.key, '2026-11'); assert.equal(k.averageTicket, 237.5); assert.equal(k.outstanding, 650); assert.equal(k.overdue, 450);
  assert.equal(k.collectionRate, 31.6);
  assert.deepEqual(receivablesAging(list, 'USD', '2026-11-07').map(b => [b.id, b.amount, b.count]), [['current', 200, 1], ['d30', 400, 1], ['d60', 0, 0], ['d60plus', 50, 1]]);
  assert.deepEqual(topClients(list, 'USD', '2026-11-07').map(c => [c.name, c.amount, c.share]), [['Acme', 550, 57.9], ['Beta', 400, 42.1]]);
  assert.equal(percentChange(10, 0), null); assert.equal(percentChange(50, 100), -50);
});

test('goal progress tells whether the current pace reaches the target', () => {
  assert.equal(goalProgress(100, 0, .5), null);
  assert.deepEqual(goalProgress(600, 1000, .5), { target: 1000, actual: 600, percent: 60, remaining: 400, reached: false, expected: 500, onTrack: true });
  assert.equal(goalProgress(300, 1000, .5)!.onTrack, false); assert.equal(goalProgress(1200, 1000, .2)!.reached, true);
  const e = periodElapsed('2026-11-15'); assert.equal(e.month, .5); assert.ok(e.year > .87 && e.year < .88);
});

test('search ignores case and accents, scores prefixes higher and highlights original text', () => {
  assert.equal(fold('Logística ÁGIL'), 'logistica agil');
  assert.ok(matches('Grupo Comercial & Logística', 'logistica grupo')); assert.ok(!matches('Grupo Comercial', 'logistica'));
  assert.equal(score('FAC-2026-0001', 'fac'), 3); assert.equal(score('Grupo Logística', 'logis'), 2); assert.equal(score('Grupo', 'zz'), 0);
  assert.deepEqual(highlight('Logística Sur', 'logis'), [{ text: 'Logís', hit: true }, { text: 'tica Sur', hit: false }]);
  assert.deepEqual(highlight('Ana', ''), [{ text: 'Ana', hit: false }]);
});

test('theme preferences cycle and resolve against the operating system', () => {
  assert.equal(nextTheme('system'), 'light'); assert.equal(nextTheme('light'), 'dark'); assert.equal(nextTheme('dark'), 'system');
  assert.equal(resolveTheme('system', true), 'dark'); assert.equal(resolveTheme('system', false), 'light'); assert.equal(resolveTheme('light', true), 'light');
  assert.ok(isThemeMode('dark') && !isThemeMode('sepia')); assert.ok(isTextSize('xlarge') && !isTextSize('huge'));
});

test('dark palette is derived from the stylesheet: tokens, readable text, untouched shadows and light paper', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 }); assert.deepEqual(parseColor('#2d6a5710'), { r: 45, g: 106, b: 87, a: .063 }); assert.deepEqual(parseColor('rgba(0, 0, 0, .5)'), { r: 0, g: 0, b: 0, a: .5 });
  assert.equal(format(darkVariant(parseColor('#ffffff')!)), '#151d1a');
  const lum = (hex: string) => { const c = parseColor(hex)!; return (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 510; };
  assert.ok(lum(format(darkVariant(parseColor('#25332e')!, 'text'))) > .75, 'ink becomes light');
  assert.ok(lum(format(darkVariant(parseColor('#b0b9af')!, 'text'))) >= .39, 'faint text stays visible');
  assert.ok(lum(format(darkVariant(parseColor('#e7ebe8')!))) < .2, 'borders become dark');
  const { css, tokens } = themeCss(':root{--ink:#25332e}.card{background:#fff;color:#25332e;box-shadow:0 2px 4px rgba(0,0,0,.1);border:1px solid white}.logo{background:url(#fff)}');
  assert.match(css, /\.card\{background:var\(--nx-ffffff\);color:var\(--nx-t25332e\);box-shadow:0 2px 4px rgba\(0,0,0,\.1\);border:1px solid var\(--nx-ffffff\)\}/);
  assert.match(css, /\.logo\{background:url\(#fff\)\}/); assert.equal(tokens.size, 2);
  assert.match(css, /:root\[data-theme="dark"\]\{color-scheme:dark;--nx-ffffff:#151d1a/);
  assert.match(css, /:root\[data-theme="dark"\] \.paper-sheet\{color-scheme:light;--nx-ffffff:#ffffff;.*--ink:var\(--nx-t25332e\)\}/);
});
