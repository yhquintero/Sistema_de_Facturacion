import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PAPER_STANDARDS_LIST, resolvePageDimensions, type PaperOrientation } from '../shared/paperStandards';
import { OFFICIAL_PRIMARY_ACTIVITY, OFFICIAL_SECONDARY_ACTIVITY } from '../shared/types';
import { calculateInvoiceTotals } from '../shared/invoiceMath';
import { generateInvoicePdfBuffer } from '../server/exporters/pdfExporter';
import { generateInvoiceDocxBuffer } from '../server/exporters/docxExporter';
import { generateInvoiceXlsxBuffer } from '../server/exporters/xlsxExporter';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-exports-')); process.env.DATA_DIR = directory; process.env.SEED_DEMO = 'true';
const { db, getInvoiceById } = await import('../server/db');
after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const invoice = getInvoiceById('inv-01')!;
for (const paper of PAPER_STANDARDS_LIST) for (const orientation of ['portrait', 'landscape'] as PaperOrientation[]) {
  test(`${paper.id} ${orientation}: PDF, DOCX and both XLSX sheets preserve standard dimensions and complete content`, async () => {
    const expected = resolvePageDimensions(paper.id, orientation);
    const [pdf, docx, xlsx] = await Promise.all([generateInvoicePdfBuffer(invoice, paper.id, orientation), generateInvoiceDocxBuffer(invoice, paper.id, orientation), generateInvoiceXlsxBuffer(invoice, paper.id, orientation)]);
    const pdfDocument = await PDFDocument.load(pdf); assert.ok(pdfDocument.getPageCount() > 0 && pdfDocument.getPageCount() < 30);
    for (const page of pdfDocument.getPages()) { assert.ok(Math.abs(page.getWidth() - expected.widthPt) < .02); assert.ok(Math.abs(page.getHeight() - expected.heightPt) < .02); }
    const word = await JSZip.loadAsync(docx); const document = await word.file('word/document.xml')!.async('string'); const dimensions = document.match(/<w:pgSz\b[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"[^>]*\/>/)!; assert.ok(dimensions); assert.equal(Number(dimensions[1]), expected.widthTwips); assert.equal(Number(dimensions[2]), expected.heightTwips);
    assert.ok(document.includes(OFFICIAL_PRIMARY_ACTIVITY)); assert.ok(document.includes(OFFICIAL_SECONDARY_ACTIVITY)); assert.ok(document.includes(invoice.contract!.paymentTerms)); assert.ok(document.includes(invoice.contract!.clausesSummary)); assert.ok(document.includes('Microsoft Windows 11 Pro')); assert.ok(document.includes('Intel Iris Xe')); assert.ok(Object.keys(word.files).some(f => f.startsWith('word/media/') && f.endsWith('.png')));
    const excel = await JSZip.loadAsync(xlsx);
    for (const filename of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) { const xml = await excel.file(filename)!.async('string'); assert.match(xml, new RegExp(`orientation="${orientation}"`)); assert.match(xml, new RegExp(`paperWidth="${paper.widthMm}mm"`)); assert.match(xml, new RegExp(`paperHeight="${paper.heightMm}mm"`)); assert.match(xml, /fitToWidth="1"/); assert.match(xml, /fitToHeight="0"/); if (paper.id === 'B5') assert.ok(!xml.match(/<pageSetup\b[^>]*paperSize=/)); if (paper.id === 'B4') assert.match(xml, /paperSize="42"/); }
    const strings = await excel.file('xl/sharedStrings.xml')!.async('string'); assert.ok(strings.includes(OFFICIAL_PRIMARY_ACTIVITY)); assert.ok(strings.includes(OFFICIAL_SECONDARY_ACTIVITY)); assert.ok(strings.includes('Microsoft Windows 11 Pro')); assert.ok(strings.includes('Intel Iris Xe')); assert.ok(strings.includes(invoice.contract!.clausesSummary));
  });
}
test('Excel formulas, cached results, complete long text, bounded heights, print areas and signatures are correct', async () => {
  const custom = structuredClone(invoice); custom.items = [{ ...custom.items[0], quantity: 2.5, unitPrice: 19.99, discountPercent: 7.5, description: 'Detalle técnico completo. '.repeat(100) + 'FIN DEL DESGLOSE' }]; Object.assign(custom, calculateInvoiceTotals(custom.items, 10));
  const bytes = await generateInvoiceXlsxBuffer(custom, 'A5', 'landscape'); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  assert.equal(workbook.worksheets.length, 2); const sheet = workbook.worksheets[0]; const formulas: { formula: string; result: number }[] = []; let completeText = '';
  sheet.eachRow(row => { assert.ok((row.height || 18) <= 250, `row ${row.number} exceeds 250 points`); row.eachCell(cell => { if (cell.type === ExcelJS.ValueType.Formula) formulas.push(cell.value as { formula: string; result: number }); if (typeof cell.value === 'string') completeText += cell.value + '\n'; }); });
  assert.ok(completeText.includes('FIN DEL DESGLOSE')); assert.ok(formulas.some(f => f.formula.includes('ROUND(ROUND(') && f.result === 46.23)); assert.ok(formulas.some(f => f.result === 50.85)); assert.ok(sheet.pageSetup.printArea?.includes('A1:H')); assert.ok(sheet.getImages().length >= 1);
});
test('PDF handles multi-page descriptions and long unbroken IDs without losing the final pages', async () => {
  const custom = structuredClone(invoice); custom.items[0].description = 'Trabajo y pruebas verificadas: '.repeat(150) + 'FIN-DESCRIPCION-LARGA'; custom.installationBlocks[0].verification.technicalObservations = 'X'.repeat(1600);
  const pdf = await generateInvoicePdfBuffer(custom, 'A5', 'landscape'); const document = await PDFDocument.load(pdf); assert.ok(document.getPageCount() >= 5); assert.ok(document.getPageCount() < 40);
});
