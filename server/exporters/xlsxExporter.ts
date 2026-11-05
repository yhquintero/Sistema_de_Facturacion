import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { lineGross } from '../../shared/invoiceMath';
import { resolvePageDimensions, type PaperOrientation, type PaperSizeId } from '../../shared/paperStandards';
import { SUPPORTED_CURRENCIES, type Invoice } from '../../shared/types';
import { dataUrlToPngBuffer } from '../utils/signaturePng';
import { scopeLabel, statusLabel } from './formatHelpers';

const INK = 'FF2B4436', GREEN = 'FF2D624E', MUTED = 'FF718374', LIGHT = 'FFF3F7F0', BORDER = 'FFE0E8DC';
/** Workbook values, cached results and formulas use the same cent-rounding rules as the server. */
export async function generateInvoiceXlsxBuffer(invoice: Invoice, paper: PaperSizeId = 'A4', orientation: PaperOrientation = 'portrait'): Promise<Buffer> {
  const dims = resolvePageDimensions(paper, orientation), supplier = invoice.supplier!, client = invoice.client!, contract = invoice.contract;
  const workbook = new ExcelJS.Workbook(); workbook.creator = supplier.ownerName; workbook.created = new Date(invoice.createdAt); workbook.modified = new Date(); workbook.calcProperties.fullCalcOnLoad = true;
  const symbol = SUPPORTED_CURRENCIES.find(c => c.code === invoice.currency)?.symbol || '$'; const moneyFormat = `"${symbol}"#,##0.00" ${invoice.currency}"`;
  const border: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: BORDER } } };
  const setup = (sheet: ExcelJS.Worksheet, cols: number[]) => {
    sheet.columns = cols.map(width => ({ width }));
    sheet.pageSetup = { paperSize: dims.standard.excelPaperCode as ExcelJS.PaperSize, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { ...dims.marginsIn, header: .2, footer: .25 } };
    const safeNumber = invoice.invoiceNumber.replaceAll('&', '&&');
    sheet.headerFooter = { oddFooter: `&L${safeNumber} · ${paper}${invoice.isDemo ? ' · DEMOSTRACIÓN' : ''}&RPágina &P de &N` };
    sheet.properties.defaultRowHeight = 18;
  };
  // Conservative wrapping and bounded row heights prevent Excel's manual-height clipping.
  const wrap = (value: string, chars: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of String(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if ((line ? `${line} ${word}` : word).length <= chars) { line = line ? `${line} ${word}` : word; continue; }
        if (line) { lines.push(line); line = ''; }
        let rest = word; while (rest.length > chars) { lines.push(rest.slice(0, chars)); rest = rest.slice(chars); } line = rest;
      }
      lines.push(line);
    }
    return lines;
  };
  const style = (cell: ExcelJS.Cell, options: { bold?: boolean; color?: string; background?: string; size?: number; align?: 'left' | 'right' | 'center' } = {}) => {
    cell.font = { name: 'Calibri', size: options.size || 10, bold: options.bold, color: { argb: options.color || INK } };
    cell.alignment = { wrapText: true, vertical: 'top', horizontal: options.align || 'left' }; cell.border = border;
    if (options.background) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.background } };
  };
  const block = (sheet: ExcelJS.Worksheet, start: number, lastColumn: number, text: string, options: { bold?: boolean; color?: string; background?: string; size?: number; align?: 'left' | 'right' | 'center' } = {}) => {
    const width = sheet.columns.slice(0, lastColumn).reduce((sum, c) => sum + (c.width || 10), 0);
    const lines = wrap(text, Math.max(20, Math.floor(width * .85))); const chunkSize = 15; let row = start;
    if (lines.length <= chunkSize) {
      sheet.mergeCells(row, 1, row, lastColumn); const cell = sheet.getCell(row, 1); cell.value = text; style(cell, options); sheet.getRow(row).height = Math.max(23, lines.length * ((options.size || 10) + 4) + 10); return row + 1;
    }
    for (let i = 0; i < lines.length; i += chunkSize) { const part = lines.slice(i, i + chunkSize); sheet.mergeCells(row, 1, row, lastColumn); const cell = sheet.getCell(row, 1); cell.value = part.join('\n'); style(cell, options); sheet.getRow(row).height = Math.max(23, part.length * ((options.size || 10) + 4) + 10); row++; }
    return row;
  };
  const sheet = workbook.addWorksheet('Factura Comercial', { views: [{ showGridLines: false }] }); setup(sheet, [11, 15, 42, 8, 8, 16, 8, 18]);
  let row = block(sheet, 1, 8, `${supplier.businessName}\n${supplier.ownerName} · ID fiscal: ${supplier.taxId} · Registro: ${supplier.registryNumber}`, { bold: true, size: 12, color: 'FFFFFFFF', background: GREEN });
  row = block(sheet, row, 8, `FACTURA ${invoice.invoiceNumber} · ${statusLabel(invoice.status)}\nEmisión: ${invoice.issueDate} · Vence: ${invoice.dueDate} · Moneda: ${invoice.currency}`, { bold: true, background: LIGHT });
  if (invoice.isDemo) row = block(sheet, row, 8, 'DOCUMENTO DE DEMOSTRACIÓN · SIN VALIDEZ FISCAL · Firmas de ejemplo', { color: 'FFAA8051', bold: true });
  row = block(sheet, row, 8, `${supplier.address}, ${supplier.city}, ${supplier.country}\n${supplier.email} · ${supplier.phone} · ${supplier.website}`, { color: MUTED }); row++;
  row = block(sheet, row, 8, 'EL CLIENTE FINAL', { bold: true, color: GREEN, background: LIGHT });
  row = block(sheet, row, 8, `${client.name} · ${client.clientType}\nIdentificación: ${client.taxId}\n${client.address}, ${client.city}\n${client.email} · ${client.phone}\nRepresentante: ${client.representativeName} · ${client.representativeRole} · Doc.: ${client.representativeId}`);
  row = block(sheet, row, 8, contract ? `CONTRATO ${contract.contractNumber} · SUMINISTRADOR ↔ CLIENTE\n${contract.title}\nVigencia: ${contract.startDate} a ${contract.endDate}\nModalidad: ${invoice.serviceModality} · Lugar: ${invoice.serviceLocation || client.address}\nPago: ${contract.paymentTerms}` : 'BORRADOR · Contrato pendiente', { background: LIGHT }); row++;
  row = block(sheet, row, 8, `ACTIVIDADES DEL SUMINISTRADOR · ${scopeLabel(invoice.activityScope)}`, { bold: true, color: GREEN });
  if (invoice.activityScope !== 'secundaria') row = block(sheet, row, 8, `Actividad Principal: ${supplier.primaryActivity}`, { color: MUTED });
  if (invoice.activityScope !== 'principal') row = block(sheet, row, 8, `Actividad Secundaria: ${supplier.secondaryActivity}`, { color: MUTED }); row++;
  row = block(sheet, row, 8, 'I. DESGLOSE ECONÓMICO DE SERVICIOS', { bold: true, color: GREEN });
  const headerRow = row;
  ['CÓDIGO', 'ACTIVIDAD', 'SERVICIO / DESCRIPCIÓN', 'UNIDAD', 'CANT.', 'PRECIO', 'DTO. %', 'IMPORTE'].forEach((v, i) => { const cell = sheet.getCell(row, i + 1); cell.value = v; style(cell, { bold: true, size: 9, color: 'FFFFFFFF', background: GREEN, align: i > 3 ? 'right' : 'left' }); }); sheet.getRow(row).height = 30; row++;
  sheet.getColumn(9).hidden = true; // Rounded gross line values support live totals without duplicating charges.
  const itemRows: number[] = [];
  for (const item of invoice.items) {
    const descriptions = wrap(`${item.title}\n${item.description}`, 34); const metadata = wrap(`${item.activityType === 'principal' ? 'Principal' : 'Secundaria'}\n${item.category}`, 12); const codes = wrap(item.code, 9); const units = wrap(item.unit, 6);
    const maxLines = Math.max(descriptions.length, metadata.length, codes.length, units.length); const step = 15; const firstRow = row;
    for (let i = 0; i < maxLines; i += step) {
      sheet.getCell(row, 1).value = codes.slice(i, i + step).join('\n'); sheet.getCell(row, 2).value = metadata.slice(i, i + step).join('\n'); sheet.getCell(row, 3).value = descriptions.slice(i, i + step).join('\n'); sheet.getCell(row, 4).value = units.slice(i, i + step).join('\n');
      if (i === 0) { itemRows.push(row); sheet.getCell(row, 5).value = item.quantity; sheet.getCell(row, 6).value = item.unitPrice; sheet.getCell(row, 7).value = item.discountPercent; sheet.getCell(row, 8).value = { formula: `ROUND(E${row}*F${row},2)-ROUND(ROUND(E${row}*F${row},2)*G${row}/100,2)`, result: item.lineTotal }; sheet.getCell(row, 9).value = { formula: `ROUND(E${row}*F${row},2)`, result: lineGross(item.quantity, item.unitPrice) }; }
      for (let c = 1; c <= 8; c++) { style(sheet.getCell(row, c), { background: itemRows.length % 2 ? 'FFFFFFFF' : LIGHT, bold: c === 8, size: 10, align: c >= 5 ? 'right' : 'left' }); }
      sheet.getCell(row, 6).numFmt = moneyFormat; sheet.getCell(row, 8).numFmt = moneyFormat; sheet.getCell(row, 7).numFmt = '0.##"%"'; sheet.getCell(row, 5).numFmt = '0.###';
      sheet.getRow(row).height = Math.max(30, Math.min(step, maxLines - i) * 14 + 10); row++;
    }
    if (row === firstRow) row++;
  }
  row++;
  const gross = itemRows.length ? `SUM(${itemRows.map(r => `I${r}`).join(',')})` : '0'; const net = itemRows.length ? `SUM(${itemRows.map(r => `H${r}`).join(',')})` : '0';
  const subtotalRow = row, discountRow = row + 1, taxRow = row + 2;
  const totalRows = [
    { label: 'Subtotal bruto', formula: gross, value: invoice.subtotal },
    { label: 'Descuentos', formula: `H${subtotalRow}-(${net})`, value: invoice.discountTotal },
    { label: `${invoice.taxName} (${invoice.taxRate}%)`, formula: `ROUND((H${subtotalRow}-H${discountRow})*${invoice.taxRate}/100,2)`, value: invoice.taxAmount },
    { label: `TOTAL ${invoice.currency}`, formula: `ROUND(H${subtotalRow}-H${discountRow}+H${taxRow},2)`, value: invoice.total },
  ];
  for (const [i, total] of totalRows.entries()) { sheet.mergeCells(row, 4, row, 7); sheet.getCell(row, 4).value = total.label; sheet.getCell(row, 8).value = { formula: total.formula, result: total.value }; sheet.getCell(row, 8).numFmt = moneyFormat; for (let c = 4; c <= 8; c++) style(sheet.getCell(row, c), { bold: true, background: i === 3 ? GREEN : LIGHT, color: i === 3 ? 'FFFFFFFF' : GREEN, align: 'right' }); sheet.getRow(row).height = 32; row++; }
  row++;
  row = block(sheet, row, 8, `PAGO Y DATOS BANCARIOS DEL SUMINISTRADOR\nMétodo: ${invoice.paymentMethod}\nTitular: ${supplier.bankHolder}\nBanco: ${supplier.bankName}\nCuenta: ${supplier.bankAccount}\nCuenta alternativa: ${supplier.bankSecondaryAccount}`, { background: LIGHT });
  row = block(sheet, row, 8, `GARANTÍA: ${invoice.warrantyNotes}\nOBSERVACIONES Y ENTREGABLES: ${invoice.notes || 'Sin observaciones adicionales.'}`, { color: MUTED });
  if (contract?.clausesSummary) row = block(sheet, row, 8, `MARCO CONTRACTUAL: ${contract.clausesSummary}`, { color: MUTED });
  row = block(sheet, row, 8, `DECLARACIÓN DE RECEPCIÓN Y CONFORMIDAD DEL CLIENTE FINAL\n${invoice.acceptanceStatement}`, { bold: true, background: 'FFF9F5E9' });
  if (contract?.acceptanceClause && contract.acceptanceClause !== invoice.acceptanceStatement) row = block(sheet, row, 8, contract.acceptanceClause, { background: 'FFF9F5E9' }); row++;
  const signatureStart = row;
  for (const [index, data] of [{ title: 'EL SUMINISTRADOR · ENTREGA', png: invoice.supplierSignatureDataUrl, name: supplier.ownerName, meta: `${supplier.ownerRole}\nID fiscal: ${supplier.taxId}` }, { title: 'EL CLIENTE FINAL · CONFORMIDAD', png: invoice.clientSignatureDataUrl, name: invoice.clientSignerName || client.representativeName, meta: `${invoice.clientSignerRole || client.representativeRole}\nDoc.: ${invoice.clientSignerId || client.representativeId}\n${invoice.clientSignedAt ? `Fecha (UTC): ${invoice.clientSignedAt}` : 'Fecha: ____ / ____ / ______'}` }].entries()) {
    const start = index === 0 ? 1 : 5, end = index === 0 ? 4 : 8;
    sheet.mergeCells(row, start, row, end); sheet.getCell(row, start).value = data.title; style(sheet.getCell(row, start), { bold: true, color: GREEN, size: 10, align: 'center' });
    sheet.mergeCells(row + 1, start, row + 3, end);
    const png = dataUrlToPngBuffer(data.png);
    if (png) { const imageId = workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' }); const padding = index === 0 ? 1 : .2; sheet.addImage(imageId, { tl: { col: start - 1 + padding, row: row + .2 }, ext: { width: 135, height: 42 } }); }
    else { sheet.getCell(row + 1, start).value = 'Espacio para firma manuscrita'; style(sheet.getCell(row + 1, start), { color: MUTED, align: 'center' }); }
    sheet.mergeCells(row + 4, start, row + 4, end); sheet.getCell(row + 4, start).value = `${data.name}\n${data.meta}`; style(sheet.getCell(row + 4, start), { bold: true, size: 9, align: 'center' });
  }
  sheet.getRow(signatureStart).height = 30; for (let r = signatureStart + 1; r <= signatureStart + 3; r++) sheet.getRow(r).height = 18; sheet.getRow(signatureStart + 4).height = 100; row += 6;
  if (invoice.signatureDocumentHash) row = block(sheet, row, 8, `Registro de integridad SHA-256: ${invoice.signatureDocumentHash}`, { size: 9, color: MUTED });
  row = block(sheet, row, 8, 'Firma manuscrita electrónica; no firma digital certificada. La copia editable no está protegida por un certificado digital. La integridad del original se comprueba en el servidor. El estado de cobro puede cambiar sin alterar el contenido aceptado.', { size: 9, color: MUTED });
  sheet.pageSetup.printArea = `A1:H${row - 1}`; sheet.pageSetup.printTitlesRow = '1:2'; sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: headerRow }];

  const technical = workbook.addWorksheet('Desglose Instalación Técnica', { views: [{ showGridLines: false, state: 'frozen', ySplit: 3 }] }); setup(technical, [24, 38, 64]);
  let tr = block(technical, 1, 3, `ANEXO TÉCNICO · ${invoice.invoiceNumber} · SO, PROGRAMAS Y DRIVERS`, { bold: true, size: 12, color: 'FFFFFFFF', background: GREEN });
  tr = block(technical, tr, 3, `${client.name}\nContrato: ${contract?.contractNumber || 'Pendiente'} · Suministrador: ${supplier.ownerName}${invoice.isDemo ? '\nDEMOSTRACIÓN · SIN VALIDEZ FISCAL' : ''}`, { background: LIGHT });
  tr = block(technical, tr, 3, 'Los componentes describen el alcance de los servicios facturados; no se suman nuevamente al total.', { size: 9, color: MUTED }); tr++;
  if (!invoice.installationBlocks.length) tr = block(technical, tr, 3, 'Esta factura no incluye intervenciones de instalación por equipo. Consulta las líneas de servicios del documento principal.');
  for (const [i, equipment] of invoice.installationBlocks.entries()) {
    tr = block(technical, tr, 3, `EQUIPO ${String(i + 1).padStart(2, '0')} · ${equipment.brandModel}\n${equipment.equipmentType}\nSerie: ${equipment.serialNumber || 'No especificada'} · Activo: ${equipment.assetCode || 'No especificado'}\nHardware: ${equipment.hardwareSpecs}\nModalidad: ${equipment.serviceModality}\nRespaldo previo: ${equipment.backupPerformed ? 'Realizado' : 'No realizado / No requerido'}. ${equipment.backupDetails}`, { bold: true, color: GREEN, background: LIGHT });
    ['COMPONENTE / CLASIFICACIÓN', 'NOMBRE, EDICIÓN Y VERSIÓN', 'LICENCIA, CONFIGURACIÓN Y VERIFICACIÓN'].forEach((t, c) => { technical.getCell(tr, c + 1).value = t; style(technical.getCell(tr, c + 1), { color: 'FFFFFFFF', background: GREEN, bold: true, size: 9 }); }); technical.getRow(tr).height = 36; tr++;
    const addComponent = (values: string[]) => { const wrapped = values.map((v, c) => wrap(v, [20, 32, 54][c])); const length = Math.max(...wrapped.map(l => l.length)); for (let offset = 0; offset < length; offset += 15) { for (let c = 0; c < 3; c++) { technical.getCell(tr, c + 1).value = wrapped[c].slice(offset, offset + 15).join('\n'); style(technical.getCell(tr, c + 1), { bold: c === 0, size: 10, color: c === 0 ? GREEN : INK }); } technical.getRow(tr).height = Math.max(32, Math.min(15, length - offset) * 14 + 10); tr++; } };
    for (const os of equipment.operatingSystems) addComponent([`SISTEMA OPERATIVO\n${os.family}`, `${os.name}\n${os.editionVersion}\n${os.architecture}`, `Intervención: ${os.installType}\nParticiones: ${os.partitionScheme}\nLicencia: ${os.licenseType}\nActualizaciones: ${os.updatesApplied ? 'Aplicadas y verificadas' : 'Pendientes de verificar'}\n${os.notes}`]);
    for (const program of equipment.programs) addComponent([`PROGRAMA / APLICACIÓN\n${program.category}`, `${program.name}\n${program.version}`, `Licencia: ${program.licenseType}\n${program.configurationNotes}`]);
    for (const driver of equipment.drivers) addComponent([`CONTROLADOR / DRIVER\n${driver.subsystem}`, `${driver.deviceName}\nFabricante: ${driver.manufacturer}\nVersión: ${driver.driverVersion}`, `Fuente: ${driver.sourceType}\nEstado: ${driver.verified ? 'Instalado y verificado' : 'Pendiente de verificar'}\n${driver.notes}`]);
    const v = equipment.verification;
    tr = block(technical, tr, 3, `VERIFICACIÓN DE ENTREGA\n${v.bootAndPerformanceOk ? '☑' : '☐'} Arranque y rendimiento\n${v.deviceManagerClean ? '☑' : '☐'} Dispositivos sin errores\n${v.networkAndPeripheralsOk ? '☑' : '☐'} Red y periféricos operativos\n${v.dataIntegrityVerified ? '☑' : '☐'} Integridad de datos\nObservaciones: ${v.technicalObservations || 'Sin observaciones adicionales.'}`, { color: GREEN, background: LIGHT }); tr++;
  }
  technical.pageSetup.printArea = `A1:C${Math.max(3, tr - 1)}`; technical.pageSetup.printTitlesRow = '1:2';
  const output = Buffer.from(await workbook.xlsx.writeBuffer());
  // OOXML has no native ISO B5 code (13 is JIS B5). Explicit dimensions avoid the wrong sheet size.
  const zip = await JSZip.loadAsync(output);
  for (const filename of Object.keys(zip.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) {
    let xml = await zip.file(filename)!.async('string');
    xml = xml.replace(/<pageSetup\b([^>]*)\/>/, (_match, attributes: string) => {
      const cleaned = (paper === 'B5' ? attributes.replace(/\spaperSize="[^"]*"/g, '') : attributes).replace(/\spaperWidth="[^"]*"|\spaperHeight="[^"]*"/g, '');
      return `<pageSetup${cleaned} paperWidth="${dims.standard.widthMm}mm" paperHeight="${dims.standard.heightMm}mm"/>`;
    }); zip.file(filename, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
