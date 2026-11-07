import { test, expect } from '@playwright/test';

test('desktop dashboard, global search, navigation and filters use real persisted data', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Todo tu negocio, en orden.' })).toBeVisible();
  await expect(page.locator('.metric-card').first()).toContainText('$3,689.40');
  await page.getByRole('button', { name: 'Buscar en el sistema' }).click(); await page.getByRole('textbox', { name: 'Buscar facturas, clientes y contratos' }).fill('FAC-2026-0001');
  await page.getByRole('dialog').getByRole('button', { name: /FAC-2026-0001/ }).click(); await expect(page.getByRole('heading', { name: 'FAC-2026-0001', exact: true, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Volver', exact: true }).click(); await page.getByRole('button', { name: /Pagadas/ }).click(); await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody')).toContainText('FAC-2026-0002');
  await page.getByRole('button', { name: /Todas/ }).click(); await page.getByRole('combobox', { name: 'Estado de conformidad' }).selectOption('pending'); await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody')).toContainText('FAC-2026-0001');
  await page.getByRole('button', { name: 'Limpiar filtros' }).click(); await expect(page.locator('tbody tr')).toHaveCount(3); expect(errors).toEqual([]);
});

test('complete client → contract → invoice → technical breakdown → signature → three downloads', async ({ page }) => {
  const suffix = Date.now().toString(36); const name = `Cliente E2E ${suffix}`; const number = `CTR-E2E-${suffix}`;
  await page.goto('/#/clients?new=1'); const clientForm = page.getByRole('dialog');
  await clientForm.getByLabel('Razón social / Nombre completo').fill(name); await clientForm.getByLabel('Código del cliente').fill(`CLI-E2E-${suffix}`); await clientForm.getByLabel('Identificación fiscal / Documento').fill('NIT-E2E-001');
  await clientForm.getByLabel('Correo electrónico').fill('cliente@example.com'); await clientForm.getByLabel('Nombre y apellidos').fill('Ana Cliente Final'); await clientForm.getByLabel('Documento de identidad').fill('ID-TEST-001'); await clientForm.getByLabel('Cargo / Representación').fill('Directora autorizada'); await clientForm.getByRole('button', { name: 'Crear cliente' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.goto('/#/contracts?new=1'); const contractForm = page.getByRole('dialog'); await contractForm.getByLabel('Número de contrato').fill(number); await contractForm.getByLabel('Cliente contratante').selectOption({ label: name }); await contractForm.getByLabel('Objeto / Título del contrato').fill('Instalación, soporte y entrega de una estación de trabajo'); await contractForm.getByLabel('Estado', { exact: true }).selectOption('vigente'); await contractForm.getByLabel('Valor del contrato').fill('500'); await contractForm.getByRole('button', { name: 'Crear contrato' }).click();
  const card = page.locator('article').filter({ hasText: number }); await card.getByRole('button', { name: 'Ver contrato' }).click(); await page.getByRole('button', { name: 'Facturar este contrato' }).click();
  await expect(page.getByRole('heading', { name: 'Una nueva factura' })).toBeVisible(); await expect(page.getByRole('combobox', { name: 'Cliente', exact: true })).toHaveValue(/cli-/);
  await page.getByRole('combobox', { name: 'Añadir servicio del catálogo' }).selectOption('srv-sec-01'); await page.getByLabel('Cantidad', { exact: true }).fill('2'); await page.getByLabel('Dto. (%)').fill('5');
  await page.getByLabel('Marca y modelo').fill('Dell Latitude E2E'); await page.getByLabel('Número de serie').fill('SN-E2E-123'); await page.getByLabel('Código de activo').fill('ACT-E2E-01'); await page.getByLabel('Especificaciones de hardware').fill('Core i7 · 16 GB RAM · NVMe 512 GB');
  await page.getByRole('combobox', { name: 'Añadir SO desde las plantillas' }).selectOption('0'); await expect(page.getByLabel('Actualizaciones instaladas y verificadas')).not.toBeChecked(); await page.getByLabel('Actualizaciones instaladas y verificadas').check();
  await page.getByRole('button', { name: /^Programas/ }).click(); await page.getByRole('combobox', { name: 'Añadir programa desde las plantillas' }).selectOption('1'); await expect(page.getByLabel('Nombre de la aplicación')).toHaveValue(/LibreOffice/);
  await page.getByRole('button', { name: /^Drivers/ }).click(); await page.getByRole('combobox', { name: 'Añadir controlador desde las plantillas' }).selectOption('0'); await expect(page.getByLabel('Controlador instalado y funcionamiento verificado')).not.toBeChecked(); await page.getByLabel('Controlador instalado y funcionamiento verificado').check();
  await page.getByRole('button', { name: /^Verificación/ }).click(); await page.getByLabel('Arranque y rendimiento comprobados').check(); await page.getByLabel('Sin dispositivos con errores / drivers pendientes').check(); await page.getByLabel('Red y periféricos operativos').check(); await page.getByLabel('Integridad de datos comprobada').check(); await page.getByLabel('Observaciones técnicas, limitaciones y pendientes').fill('Intervención verificada en presencia del cliente.');
  await expect(page.locator('.summary-total')).toContainText('$135.85'); await page.getByRole('button', { name: 'Guardar y emitir' }).click(); await expect(page.locator('h1')).toHaveText(/^FAC-/); await expect(page.locator('.paper-sheet')).toContainText('Dell Latitude E2E'); await expect(page.locator('.paper-sheet')).toContainText('LibreOffice');
  const invoiceHash = page.url().split('#')[1];
  await page.getByRole('button', { name: 'Firma del Cliente Final' }).click(); const signDialog = page.getByRole('dialog'); await expect(signDialog.getByLabel('Nombre y apellidos del firmante')).toHaveValue('Ana Cliente Final'); const canvas = signDialog.locator('canvas'); await canvas.scrollIntoViewIfNeeded(); const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + 50, rect.y + 90); await page.mouse.down(); for (let i = 0; i < 35; i++) await page.mouse.move(rect.x + 50 + i * 7, rect.y + 85 - Math.sin(i * .5) * 28); await page.mouse.up(); await signDialog.getByRole('checkbox', { name: /Actúo como representante autorizado/ }).check(); await signDialog.getByRole('button', { name: 'Firmar y aceptar la entrega' }).click();
  await expect(page.locator('.signed-notice')).toContainText('Ana Cliente Final'); await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Integridad y registro de actividad' }).click(); await expect(page.getByRole('dialog')).toContainText('El contenido coincide con su huella'); await expect(page.locator('.audit-events li')).toHaveCount(2); await expect(page.getByRole('dialog')).toContainText('Consentimiento explícito registrado'); await page.getByRole('button', { name: 'Volver al documento' }).click();
  await page.getByLabel('Estándar de hoja').selectOption('B5'); await page.getByLabel('Orientación', { exact: true }).selectOption('landscape');
  for (const [name, ext] of [['Documento PDF', 'pdf'], ['Microsoft Word', 'docx'], ['Microsoft Excel', 'xlsx']]) { const waitForDownload = page.waitForEvent('download'); await page.locator('.export-button').filter({ hasText: name }).click(); const download = await waitForDownload; expect(download.suggestedFilename()).toMatch(new RegExp(`_B5_Horizontal\\.${ext}$`)); expect(await download.failure()).toBeNull(); }
  await page.reload(); await expect(page.locator('.signed-notice')).toContainText('Ana Cliente Final'); await expect(page.locator('.paper-sheet')).toContainText(number); expect(page.url()).toContain(invoiceHash.split('?')[0]);
});

test('drafts can be saved without a contract but cannot be issued or signed', async ({ page }) => {
  await page.goto('/#/invoices/new'); await page.getByRole('combobox', { name: 'Cliente', exact: true }).selectOption('cli-01'); await page.getByRole('button', { name: 'Guardar y emitir' }).click(); await expect(page.getByRole('alert')).toContainText('Vincula un contrato');
  await page.getByRole('button', { name: 'Guardar borrador' }).click(); await expect(page.locator('.status-badge.borrador').first()).toBeVisible(); await expect(page.getByRole('button', { name: 'Firma del Cliente Final' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click(); await page.getByRole('button', { name: 'Sí, eliminar' }).click(); await expect(page.getByRole('heading', { name: 'Facturas', exact: true })).toBeVisible();
});

test('mobile navigation and touch signature canvas work without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await expect(page.locator('.mobile-nav')).toBeVisible(); await page.locator('.mobile-nav').getByRole('button', { name: 'Facturas', exact: true }).click(); await expect(page.locator('h1')).toHaveText('Facturas'); await page.getByRole('button', { name: 'FAC-2026-0001', exact: true }).click(); await page.getByRole('button', { name: 'Firma del Cliente Final' }).click();
  const canvas = page.getByRole('dialog').locator('canvas'); await canvas.scrollIntoViewIfNeeded(); const bounds = (await canvas.boundingBox())!; const cdp = await page.context().newCDPSession(page); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 30, y: bounds.y + 80 }] }); for (let i = 1; i < 30; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + 30 + i * 6, y: bounds.y + 80 - Math.sin(i * .7) * 25 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await canvas.evaluate((element: HTMLCanvasElement) => { const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data; return Array.from(data).filter((_, index) => index % 4 === 3 && data[index] > 0).length; })).toBeGreaterThan(100);
  await page.setViewportSize({ width: 844, height: 620 }); await page.waitForTimeout(300); expect(await canvas.evaluate((element: HTMLCanvasElement) => element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data.some(v => v > 0))).toBe(true);
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click(); expect(await canvas.evaluate((element: HTMLCanvasElement) => element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data.some(v => v > 0))).toBe(false);
  await page.getByRole('button', { name: 'Volver a revisar' }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('all views remain contained at mobile, tablet and desktop sizes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const width of [360, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); for (const route of ['/', '/invoices', '/clients', '/contracts', '/catalog', '/settings', '/invoices/new', '/invoices/inv-02']) { await page.goto(`/#${route}`); await expect(page.locator('h1')).toBeVisible(); await page.waitForTimeout(150); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${route} overflows at ${width}px`).toBe(false); } }
  expect(errors).toEqual([]);
});


test('protected production login, logout and private offline PWA fallback', async ({ page, context }) => {
  await page.goto('http://127.0.0.1:3101'); await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo.' })).toBeVisible(); await page.getByRole('button',{name:'Privacidad y tus datos',exact:true}).click(); await expect(page.getByRole('dialog')).toContainText('Gestión contractual'); await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.getByLabel('Usuario').fill('admin'); await page.getByLabel('Contraseña').fill('una-incorrecta'); await page.getByRole('button', { name: 'Entrar a mi espacio' }).click(); await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos.');
  await page.getByLabel('Contraseña').fill('clave-publica-solo-para-e2e'); await page.getByRole('button', { name: 'Entrar a mi espacio' }).click(); await expect(page.locator('h1')).toHaveText('Todo tu negocio, en orden.');
  const cookie = (await context.cookies()).find(cookie => cookie.name === 'nexo_session'); expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe('Strict');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await context.setOffline(true); await page.reload(); await expect(page.locator('h1')).toHaveText('Volvemos en cuanto te conectes.'); await expect(page.locator('body')).not.toContainText('Grupo Comercial');
  const cached = await page.evaluate(async () => { const values: string[] = []; for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) values.push(new URL(request.url).pathname); return values; }); expect(cached).toContain('/offline.html'); expect(cached.some(path => path.startsWith('/api/'))).toBe(false);
  // Let the offline page's automatic navigation finish; a competing goto can abort it.
  // If CDP restores the worker after `online`, exercise the visible manual retry.
  const reconnectNavigation = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
  await context.setOffline(false); await reconnectNavigation; await page.waitForLoadState('load');
  const reconnect = page.getByRole('button', {name:'Volver a conectar',exact:true});
  if (await reconnect.isVisible()) await reconnect.click();
  await expect(page.locator('h1')).toHaveText('Todo tu negocio, en orden.'); await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await expect(page.getByRole('button', { name: 'Entrar a mi espacio' })).toBeVisible(); await expect(page.locator('body')).not.toContainText('Grupo Comercial');
});

test('an administrator invites a read-only colleague who must choose a password and cannot modify anything', async ({ page }) => {
  await page.goto('http://127.0.0.1:3101'); await page.getByLabel('Usuario').fill('admin'); await page.getByLabel('Contraseña').fill('clave-publica-solo-para-e2e'); await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await page.getByRole('button', { name: 'Usuarios y acceso' }).click(); await expect(page.getByRole('heading', { name: 'Usuarios y acceso', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo usuario' }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre y apellidos').fill('Lucía Consulta'); await dialog.getByRole('textbox', { name: 'Usuario' }).fill('lucia.consulta'); await dialog.getByText('Solo lectura', { exact: true }).click();
  await dialog.getByLabel('Contraseña temporal').fill('temporal-de-lucia-e2e'); await dialog.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('dialog')).toContainText('temporal-de-lucia-e2e'); await page.getByRole('button', { name: 'Hecho' }).click();
  await expect(page.locator('.users-table')).toContainText('@lucia.consulta'); await expect(page.locator('.users-table')).toContainText('Contraseña temporal');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByLabel('Usuario').fill('lucia.consulta'); await page.getByLabel('Contraseña').fill('temporal-de-lucia-e2e'); await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu propia contraseña.' })).toBeVisible();
  await page.getByLabel('Contraseña temporal').fill('temporal-de-lucia-e2e'); await page.getByRole('textbox', { name: 'Nueva contraseña', exact: true }).fill('mi-clave-definitiva-2026'); await page.getByLabel('Repite la nueva contraseña').fill('mi-clave-definitiva-2026'); await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page.locator('h1')).toHaveText('Todo tu negocio, en orden.'); await expect(page.locator('.sidebar-profile')).toContainText('Solo lectura');
  await expect(page.getByRole('button', { name: 'Nueva factura' })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Usuarios y acceso' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clientes', exact: true }).first().click(); await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toHaveCount(0);
  await page.locator('.sidebar-nav .nav-item', { hasText: 'Facturas' }).click(); await page.locator('.invoice-id').first().click(); await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0); await expect(page.getByLabel('Actualizar estado de cobro')).toBeDisabled();
  await page.goto('http://127.0.0.1:3101/#/invoices/new'); await expect(page.getByText('Tu rol no permite crear facturas')).toBeVisible();
  await page.goto('http://127.0.0.1:3101/#/fiscal'); await expect(page.getByRole('heading',{name:'Un cierre que puedas explicar.'})).toBeVisible(); await expect(page.getByRole('button',{name:'Registrar movimiento',exact:true})).toBeDisabled(); await expect(page.getByRole('button',{name:'Perfil fiscal',exact:true})).toBeDisabled();
  const session = await (await page.request.get('http://127.0.0.1:3101/api/session')).json(); const blocked = await page.request.post('http://127.0.0.1:3101/api/fiscal/entries',{headers:{'X-CSRF-Token':session.csrfToken},data:{}}); expect(blocked.status()).toBe(403);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await expect(page.getByRole('button', { name: 'Entrar a mi espacio' })).toBeVisible();
});
