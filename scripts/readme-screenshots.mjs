// Genera las capturas del README y del sitio de GitHub Pages (docs/assets).
//
// Uso (con el servidor de demostración levantado):
//   node --import tsx tests/e2e-server.ts          # http://127.0.0.1:3100, datos ficticios
//   npm run docs:capturas
//
// Variables opcionales:
//   CAPTURE_URL     URL del servidor de demostración (por defecto http://127.0.0.1:3100)
//   CHROME_PATH     ejecutable de Chromium/Chrome si Playwright no tiene uno instalado
//   CAPTURE_FONT    ruta a un .woff2 de Inter para entornos sin la fuente instalada
//
// Solo usa datos de demostración. Nunca lo ejecutes contra una base con datos reales.
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_URL || 'http://127.0.0.1:3100';
const OUT = path.resolve('docs/assets');
const SHOTS = path.join(OUT, 'capturas');
await mkdir(SHOTS, { recursive: true });

const fontCss = process.env.CAPTURE_FONT
  ? `@font-face{font-family:Inter;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${(await readFile(process.env.CAPTURE_FONT)).toString('base64')}) format('woff2')}`
  : '';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--font-render-hinting=none', '--lang=es-ES'] });

async function open(viewport, theme = 'light', scale = 2) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, locale: 'es-ES', timezoneId: 'America/Havana', bypassCSP: Boolean(fontCss), colorScheme: theme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce' });
  await context.addInitScript(([t]) => { localStorage.setItem('nexo.theme', t); localStorage.setItem('nexo.tour.done', '1'); }, [theme]);
  const page = await context.newPage();
  if (fontCss) page.on('domcontentloaded', () => page.addStyleTag({ content: fontCss }).catch(() => {}));
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '*,*:before,*:after{animation:none!important;transition:none!important;caret-color:transparent!important}.toast-stack{display:none!important}' });
  // Algunos entornos sin fuentes del sistema no tienen el glifo ⌘.
  await page.evaluate(() => document.querySelectorAll('kbd').forEach(k => { if (k.textContent?.includes('⌘')) k.textContent = k.textContent.replace('⌘', 'Ctrl'); }));
  await page.waitForTimeout(400);
}

async function shot(page, route, file, prepare) {
  await page.goto(`${BASE}/#${route}`);
  await page.locator('main').waitFor();
  if (prepare) await prepare(page);
  await settle(page);
  await page.screenshot({ path: path.join(SHOTS, file) });
  console.log('✓', file);
}

const desktop = { width: 1440, height: 900 };
const { context, page } = await open(desktop);
await shot(page, '/', 'resumen.png', p => p.getByRole('heading', { name: 'Todo tu negocio, en orden.' }).waitFor());
await shot(page, '/invoices', 'facturas.png', p => p.locator('tbody tr').first().waitFor());
await shot(page, '/invoices', 'factura-detalle.png', async p => {
  await p.getByRole('button', { name: 'Buscar en el sistema' }).click();
  await p.getByRole('textbox', { name: 'Buscar facturas, clientes y contratos' }).fill('FAC-2026-0001');
  await p.getByRole('dialog').getByRole('button', { name: /FAC-2026-0001/ }).click();
  await p.getByRole('heading', { name: 'FAC-2026-0001', exact: true, level: 1 }).waitFor();
});
await shot(page, '/invoices/new', 'nueva-factura.png');
await shot(page, '/contracts', 'contratos.png', p => p.locator('article').first().waitFor());
await shot(page, '/analytics', 'analisis.png');
await shot(page, '/fiscal', 'fiscal.png');
await shot(page, '/security', 'seguridad.png');
await context.close();

const dark = await open(desktop, 'dark');
await shot(dark.page, '/', 'resumen-oscuro.png', p => p.getByRole('heading', { name: 'Todo tu negocio, en orden.' }).waitFor());
await dark.context.close();

const mobile = await open({ width: 390, height: 844 }, 'light', 3);
await shot(mobile.page, '/', 'movil.png', p => p.getByRole('heading', { name: 'Todo tu negocio, en orden.' }).waitFor());
await mobile.context.close();

// Imagen principal y vista previa social: composición HTML con las capturas reales.
const img = async name => `data:image/png;base64,${(await readFile(path.join(SHOTS, name))).toString('base64')}`;
const icon = `data:image/png;base64,${(await readFile('public/icons/icon-512.png')).toString('base64')}`;
const [desk, phone] = [await img('resumen.png'), await img('movil.png')];

async function compose(file, size, html) {
  const { context: c, page: p } = await open(size, 'light', 1.5);
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
    *{box-sizing:border-box;margin:0}body{width:${size.width}px;height:${size.height}px;overflow:hidden;font-family:Inter,'Open Sans',sans-serif;
    background:radial-gradient(1200px 600px at 85% -10%,#cfe6d8 0,transparent 60%),radial-gradient(900px 500px at -10% 110%,#e3efe6 0,transparent 55%),linear-gradient(160deg,#f6faf7,#e9f2ec);color:#1f3a2e}
    .browser{position:absolute;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 30px 80px #17392a33,0 2px 6px #17392a1a;border:1px solid #d6e3db}
    .bar{height:30px;background:#f1f5f2;border-bottom:1px solid #e1e9e4;display:flex;align-items:center;gap:7px;padding:0 13px}.bar i{width:10px;height:10px;border-radius:50%;background:#d9e2dc;display:block}
    .bar span{margin-left:14px;font-size:11px;color:#7d8d83;background:#fff;border:1px solid #e3eae5;border-radius:6px;padding:3px 12px}
    .browser img{display:block;width:100%}
    .phone{position:absolute;border-radius:38px;padding:9px;background:#14261d;box-shadow:0 30px 70px #17392a55}.phone img{display:block;width:100%;border-radius:30px}
    .brand{display:flex;align-items:center;gap:16px}.brand img{width:64px;height:64px;border-radius:16px;box-shadow:0 8px 20px #2d6a5733}
    h1{font-size:54px;letter-spacing:-2.4px;line-height:1}h1 b{color:#2d6a57}p.t{font-size:22px;color:#3e5a4c;line-height:1.45;letter-spacing:-.3px}
    .chips{display:flex;flex-wrap:wrap;gap:8px}.chips span{font-size:14px;font-weight:600;color:#2d6a57;background:#ffffffc0;border:1px solid #cfe1d6;border-radius:999px;padding:6px 13px}
  </style></head><body>${html}</body></html>`);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, file) });
  await c.close(); console.log('✓', file);
}

await compose('nexo-hero.png', { width: 1600, height: 860 }, `
  <div class="browser" style="left:70px;top:70px;width:1220px"><div class="bar"><i></i><i></i><i></i><span>nexo.local · Resumen general</span></div><img src="${desk}"></div>
  <div class="phone" style="left:1255px;top:150px;width:290px"><img src="${phone}"></div>`);

await compose('social-preview.png', { width: 1280, height: 640 }, `
  <div style="position:absolute;left:70px;top:88px;width:520px;display:grid;gap:26px">
    <div class="brand"><img src="${icon}"><h1>nexo<b>.</b></h1></div>
    <p class="t">Facturación para trabajadores por cuenta propia en Cuba: clientes, contratos, facturas, conformidad y registro fiscal.</p>
    <div class="chips"><span>PWA</span><span>Servidor propio</span><span>HTTPS</span><span>2FA</span><span>Copias cifradas</span><span>ONAT</span></div>
  </div>
  <div class="browser" style="left:640px;top:96px;width:760px"><div class="bar"><i></i><i></i><i></i><span>Resumen general</span></div><img src="${desk}"></div>
  <div class="phone" style="left:1040px;top:196px;width:190px;border-radius:30px;padding:7px"><img src="${phone}" style="border-radius:24px"></div>`);

await browser.close();
