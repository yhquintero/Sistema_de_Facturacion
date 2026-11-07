import {test,expect} from '@playwright/test';

test('fiscal cashbook creates/reverses entries, synchronizes a second browser and downloads genuine auxiliary workbooks',async({page,browser})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#/fiscal');await expect(page.getByRole('heading',{name:'Un cierre que puedas explicar.'})).toBeVisible();await expect(page.locator('.fiscal-metric').first()).toContainText('0.00');await expect(page.locator('.fiscal-metric strong').first()).toHaveText(/^CUP\s*0\.00$/);
  const secondContext=await browser.newContext();const second=await secondContext.newPage();
  try{await second.goto('http://127.0.0.1:3100/#/fiscal');await expect(second.locator('.footer')).toContainText('Tiempo real activo');
    await page.getByRole('button',{name:'Registrar movimiento',exact:true}).click();const form=page.getByRole('dialog');await form.getByLabel('Descripción del movimiento').fill('Cobro sintético E2E de 25 CUP');await form.getByLabel('Importe original').fill('25');await form.getByLabel('Comprobante / referencia documental').fill('REC-E2E-ONLY');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Guardar movimiento'}).click();await expect(form).toHaveCount(0);
    await expect(page.locator('.fiscal-metric').first()).toContainText('25.00');await expect(second.locator('.fiscal-metric').first()).toContainText('25.00');
    const downloading=page.waitForEvent('download');await page.getByRole('button',{name:/Libro Excel de preparación/}).click();const workbook=await downloading;expect(workbook.suggestedFilename()).toMatch(/AUXILIAR_NO_OFICIAL_CUBA_2026.xlsx/);expect(await workbook.failure()).toBeNull();
    await page.getByRole('button',{name:/Libro de movimientos/}).click();await expect(page.locator('.fiscal-book')).toContainText('REC-E2E-ONLY');await page.getByRole('button',{name:'Revertir',exact:true}).click();const reverse=page.getByRole('dialog');await reverse.getByLabel('Motivo de la reversión').fill('Reversión de comprobación de prueba automatizada');await reverse.getByRole('button',{name:'Registrar reversión'}).click();await expect(reverse).toHaveCount(0);await expect(second.locator('.fiscal-metric').first()).toContainText('0.00');await expect(page.locator('.fiscal-book tbody tr')).toHaveCount(2);
    await page.getByRole('button',{name:'Resumen y revisión'}).click();await expect(page.locator('.fiscal-pending')).toContainText('no habilitados');expect(errors).toEqual([]);
  }finally{await secondContext.close();}
});

test('security and fiscal views stay contained on mobile/tablet/desktop and report pending controls honestly',async({page})=>{
  for(const width of [360,768,1440]){await page.setViewportSize({width,height:900});for(const route of ['/fiscal','/security']){await page.goto('/#'+route);await expect(page.locator('h1')).toBeVisible();await expect(page.locator('.fiscal-disclaimer')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`${route} at ${width}`).toBe(false);}}
  await expect(page.locator('.security-status-list').first()).toContainText('Pendientes. Un espacio compartido');await expect(page.locator('.security-status-list').last()).toContainText('No verificado');await expect(page.locator('.realtime-pill')).toContainText('Canal en tiempo real conectado');
});

test('authenticated fiscal writes carry CSRF and a second protected session refreshes without reloading',async({page,browser})=>{
  const context=await browser.newContext(),second=await context.newPage();const signIn=async(p:typeof page)=>{await p.goto('http://127.0.0.1:3101/#/fiscal');await p.getByLabel('Contraseña de acceso').fill('clave-publica-solo-para-e2e');await p.getByRole('button',{name:'Entrar a mi espacio'}).click();await expect(p.getByRole('heading',{name:'Un cierre que puedas explicar.'})).toBeVisible();};
  try{await signIn(page);await signIn(second);await page.getByRole('button',{name:'Registrar movimiento',exact:true}).click();const form=page.getByRole('dialog');await form.getByLabel('Descripción del movimiento').fill('Cobro protegido de prueba');await form.getByLabel('Importe original').fill('18.75');await form.getByLabel('Comprobante / referencia documental').fill('REC-SEC-E2E');const pending=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/api/fiscal/entries'));await form.getByRole('button',{name:'Guardar movimiento'}).click();expect((await pending).headers()['x-csrf-token']).toHaveLength(43);await expect(second.locator('.fiscal-metric').first()).toContainText('18.75');
    await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByLabel('Contraseña de acceso')).toBeVisible();expect((await page.request.get('http://127.0.0.1:3101/api/fiscal/report?year=2026')).status()).toBe(401);await expect(second.locator('h1')).toHaveText('Un cierre que puedas explicar.');
  }finally{await context.close();}
});
