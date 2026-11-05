import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { resolvePageDimensions, type PaperOrientation, type PaperSizeId } from '../../shared/paperStandards';
import type { Invoice, InvoiceLineItem } from '../../shared/types';
import { dataUrlToPngBuffer } from '../utils/signaturePng';
import { formatMoney, formatMoneyCompact, scopeLabel, statusLabel } from './formatHelpers';

const FONT_DIR = fileURLToPath(new URL('../assets/fonts/', import.meta.url));
const GREEN = '#2d624e', INK = '#293c33', MUTED = '#708278', BORDER = '#e0e8e1', LIGHT = '#f5f8f4';
type TextLine = { text: string; font: 'Body' | 'Strong'; size: number; color: string; height: number };

/** Real paper dimensions in points, embedded Unicode fonts and explicit, lossless pagination. */
export async function generateInvoicePdfBuffer(invoice: Invoice, paper: PaperSizeId = 'A4', orientation: PaperOrientation = 'portrait'): Promise<Buffer> {
  const dims = resolvePageDimensions(paper, orientation); const supplier = invoice.supplier!, client = invoice.client!, contract = invoice.contract;
  if (!supplier || !client) throw new Error('La factura no contiene los datos de las partes.');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: [dims.widthPt, dims.heightPt], margins: { ...dims.marginsPt, bottom: dims.marginsPt.bottom + 25 }, bufferPages: true, compress: true, info: { Title: `${invoice.invoiceNumber} · Factura y acta de conformidad`, Author: supplier.ownerName, Creator: 'Nexo Facturación', Subject: `${client.name} · ${dims.standard.shortLabel}` } });
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.registerFont('Body', path.join(FONT_DIR, 'DejaVuSans.ttf')); doc.registerFont('Strong', path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
    const scale = dims.widthMm < 185 ? .86 : 1; const size = (n: number) => n * scale;
    const left = dims.marginsPt.left, width = dims.printableWidthPt, bottom = dims.heightPt - dims.marginsPt.bottom - 26;
    let y = dims.marginsPt.top;
    const split = (text: string, lineWidth = width, font: TextLine['font'] = 'Body', fontSize = size(8.3), color = INK): TextLine[] => {
      doc.font(font).fontSize(fontSize);
      const result: TextLine[] = [];
      const push = (value: string) => result.push({ text: value, font, size: fontSize, color, height: fontSize * 1.5 });
      for (const paragraph of String(text).replaceAll('\r', '').split('\n')) {
        if (!paragraph) { push(''); continue; }
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (doc.widthOfString(candidate) <= lineWidth) { line = candidate; continue; }
          if (line) { push(line); line = ''; }
          if (doc.widthOfString(word) <= lineWidth) { line = word; continue; }
          for (const character of Array.from(word)) { if (line && doc.widthOfString(line + character) > lineWidth) { push(line); line = ''; } line += character; }
        }
        if (line) push(line);
      }
      return result;
    };
    const oneLine = (text: string, lineWidth: number, fontSize: number) => {
      doc.font('Body').fontSize(fontSize); if (doc.widthOfString(text) <= lineWidth) return text;
      let shortened = text; while (shortened && doc.widthOfString(shortened + '…') > lineWidth) shortened = shortened.slice(0, -1); return shortened + '…';
    };
    const heightOf = (lines: TextLine[]) => lines.reduce((sum, line) => sum + line.height, 0);
    const writeAt = (lines: TextLine[], x: number, top: number, lineWidth: number, align: 'left' | 'right' | 'center' = 'left') => { let cy = top; for (const line of lines) { doc.font(line.font).fontSize(line.size).fillColor(line.color).text(line.text, x, cy, { width: lineWidth, lineBreak: false, align }); cy += line.height; } };
    const newPage = () => { doc.addPage(); y = dims.marginsPt.top; doc.font('Strong').fontSize(size(7)).fillColor(GREEN).text(oneLine(`${invoice.invoiceNumber} · ${client.name}`, width, size(7)), left, y, { width, lineBreak: false }); y += 15; doc.moveTo(left, y).lineTo(left + width, y).strokeColor(BORDER).lineWidth(.5).stroke(); y += 12; };
    const ensure = (height: number) => { if (y + height > bottom) newPage(); };
    const paragraph = (text: string, options: { font?: TextLine['font']; size?: number; color?: string; indent?: number; gap?: number } = {}) => {
      const indent = options.indent || 0; const lines = split(text, width - indent, options.font || 'Body', options.size || size(8.3), options.color || INK);
      const paragraphHeight = heightOf(lines); if (paragraphHeight <= bottom - dims.marginsPt.top - 27) ensure(paragraphHeight);
      for (const line of lines) { ensure(line.height); writeAt([line], left + indent, y, width - indent); y += line.height; }
      y += options.gap ?? 5;
    };
    const section = (title: string) => { const lines = split(title, width - 14, 'Strong', size(9.1), GREEN); ensure(heightOf(lines) + 85); y += 9; doc.roundedRect(left, y + 2, 3, 10, 1).fill('#90b49a'); writeAt(lines, left + 11, y, width - 14); y += heightOf(lines) + 10; };
    const box = (title: string, body: string, tint = LIGHT) => {
      let lines = [...split(title, width - 24, 'Strong', size(8.6), GREEN), ...split(body, width - 24, 'Body', size(8), INK)];
      while (lines.length) {
        if (bottom - y < 60) newPage();
        let count = 0, height = 20;
        while (count < lines.length && height + lines[count].height <= bottom - y) { height += lines[count].height; count++; }
        if (!count) { newPage(); continue; }
        doc.roundedRect(left, y, width, height, 4).fillAndStroke(tint, BORDER); writeAt(lines.slice(0, count), left + 12, y + 9, width - 24); y += height + 9; lines = lines.slice(count); if (lines.length) newPage();
      }
    };
    // Flexible-height masthead: no clipping on compact sheets or long business names.
    const headLeft = width * .60, headRight = width * .33;
    const supplierLines = [...split(supplier.businessName, headLeft, 'Strong', size(11), '#ffffff'), ...split(`${supplier.ownerName}\nID fiscal: ${supplier.taxId} · ${supplier.registryNumber}`, headLeft, 'Body', size(7.2), '#d3e3d7')];
    const invoiceLines = [...split('FACTURA', headRight, 'Strong', size(16), '#ffffff'), ...split(`${invoice.invoiceNumber}\nEmisión: ${invoice.issueDate}\nVencimiento: ${invoice.dueDate}\n${statusLabel(invoice.status)} · ${invoice.currency}`, headRight, 'Body', size(7.6), '#d3e3d7')];
    const headHeight = Math.max(heightOf(supplierLines), heightOf(invoiceLines)) + 26;
    doc.roundedRect(left, y, width, headHeight, 5).fill('#294f40'); writeAt(supplierLines, left + 13, y + 12, headLeft); writeAt(invoiceLines, left + width - headRight - 13, y + 12, headRight, 'right'); y += headHeight + 10;
    if (invoice.isDemo) { paragraph('DOCUMENTO DE DEMOSTRACIÓN · SIN VALIDEZ FISCAL · Firmas de ejemplo', { font: 'Strong', size: size(7.2), color: '#aa8051', gap: 7 }); }
    paragraph(`${supplier.address}, ${supplier.city}, ${supplier.country}\n${supplier.email} · ${supplier.phone}${supplier.website ? ` · ${supplier.website}` : ''}`, { size: size(7.3), color: MUTED, gap: 7 });
    section('LAS PARTES Y EL MARCO CONTRACTUAL');
    box('EL CLIENTE FINAL', `${client.name}\nIdentificación: ${client.taxId} · ${client.clientType}\n${client.address}, ${client.city}\n${client.email} · ${client.phone}\nRepresentante: ${client.representativeName} · ${client.representativeRole}\nDocumento: ${client.representativeId}`);
    box(contract ? `CONTRATO ${contract.contractNumber} · SUMINISTRADOR ↔ CLIENTE` : 'BORRADOR · CONTRATO PENDIENTE', contract ? `${contract.title}\nVigencia: ${contract.startDate} a ${contract.endDate}\nModalidad: ${invoice.serviceModality}\nLugar: ${invoice.serviceLocation || client.address}\nPago: ${invoice.paymentMethod}. ${contract.paymentTerms}` : `Modalidad: ${invoice.serviceModality}\nLugar: ${invoice.serviceLocation || client.address}\nPago: ${invoice.paymentMethod}`);

    section('I. DESGLOSE ECONÓMICO DE SERVICIOS');
    const columns = [width * .55, width * .12, width * .16, width * .17];
    const header = () => { const h = size(25); doc.rect(left, y, width, h).fill(GREEN); let x = left; ['SERVICIO / ENTREGABLE', 'CANT.', 'P. UNITARIO', 'IMPORTE'].forEach((label, i) => { writeAt(split(label, columns[i] - 12, 'Strong', size(6.8), '#ffffff'), x + 6, y + 7, columns[i] - 12, i > 0 ? 'right' : 'left'); x += columns[i]; }); y += h; };
    ensure(size(70)); header();
    const serviceRow = (item: InvoiceLineItem, index: number) => {
      let lines = [...split(`${item.code} · ${item.activityType === 'principal' ? 'Actividad Principal' : 'Actividad Secundaria'}`, columns[0] - 14, 'Body', size(7), MUTED), ...split(item.title, columns[0] - 14, 'Strong', size(8.2)), ...split(item.description, columns[0] - 14, 'Body', size(7.5))];
      if (item.discountPercent) lines.push(...split(`Descuento aplicado: ${item.discountPercent}%`, columns[0] - 14, 'Body', size(7), MUTED));
      const numbers = [split(`${item.quantity}\n${item.unit}`, columns[1] - 12, 'Body', size(7.2)), split(formatMoneyCompact(item.unitPrice, invoice.currency), columns[2] - 12, 'Body', size(7.3)), split(formatMoneyCompact(item.lineTotal, invoice.currency), columns[3] - 12, 'Strong', size(7.6), GREEN)];
      let first = true;
      while (lines.length) {
        const required = Math.min(heightOf(lines) + 18, bottom - dims.marginsPt.top - 70);
        if (y + required > bottom && y > dims.marginsPt.top + 60) { newPage(); header(); }
        if (bottom - y < Math.max(size(45), first ? Math.max(...numbers.map(n => heightOf(n) + 18)) : 0)) { newPage(); header(); }
        let count = 0, rowHeight = 18;
        while (count < lines.length && rowHeight + lines[count].height <= bottom - y) { rowHeight += lines[count].height; count++; }
        if (first) rowHeight = Math.max(rowHeight, ...numbers.map(n => heightOf(n) + 18));
        doc.rect(left, y, width, rowHeight).fillAndStroke(index % 2 ? LIGHT : '#ffffff', BORDER);
        writeAt(lines.slice(0, count), left + 7, y + 8, columns[0] - 14);
        if (first) { let x = left + columns[0]; numbers.forEach((n, i) => { writeAt(n, x + 6, y + 8, columns[i + 1] - 12, 'right'); x += columns[i + 1]; }); }
        y += rowHeight; lines = lines.slice(count); first = false; if (lines.length) { newPage(); header(); }
      }
    };
    invoice.items.forEach(serviceRow);
    if (!invoice.items.length) paragraph('Borrador sin servicios agregados.');
    y += 10;
    const totalRows: [string, string][] = [['Subtotal bruto', formatMoney(invoice.subtotal, invoice.currency)], ['Descuentos', `−${formatMoney(invoice.discountTotal, invoice.currency)}`], [`${invoice.taxName} (${invoice.taxRate}%)`, formatMoney(invoice.taxAmount, invoice.currency)], ['TOTAL FACTURADO', formatMoney(invoice.total, invoice.currency)]];
    const totalWidth = Math.min(width, 300);
    const totalLines = totalRows.map(([label, value], i) => ({ label: split(label, totalWidth * .51 - 16, i === 3 ? 'Strong' : 'Body', size(i === 3 ? 8.5 : 7.5), i === 3 ? '#ffffff' : MUTED), value: split(value, totalWidth * .49 - 16, 'Strong', size(i === 3 ? 9.2 : 7.6), i === 3 ? '#ffffff' : GREEN) }));
    const totalHeight = totalLines.reduce((sum, row) => sum + Math.max(heightOf(row.label), heightOf(row.value)) + 15, 0);
    ensure(totalHeight + 10);
    totalLines.forEach((row, i) => { const h = Math.max(heightOf(row.label), heightOf(row.value)) + 15, x = left + width - totalWidth; doc.rect(x, y, totalWidth, h).fill(i === 3 ? GREEN : LIGHT); writeAt(row.label, x + 9, y + 7, totalWidth * .51 - 16); writeAt(row.value, x + totalWidth * .51 + 7, y + 7, totalWidth * .49 - 16, 'right'); y += h; }); y += 8;

    section('ACTIVIDADES ECONÓMICAS DEL SUMINISTRADOR');
    paragraph(scopeLabel(invoice.activityScope), { font: 'Strong', size: size(8) });
    if (invoice.activityScope !== 'secundaria') paragraph(`Actividad Principal: ${supplier.primaryActivity}`, { size: size(7.6), color: MUTED });
    if (invoice.activityScope !== 'principal') paragraph(`Actividad Secundaria: ${supplier.secondaryActivity}`, { size: size(7.6), color: MUTED });

    if (invoice.installationBlocks.length) {
      section('II. ANEXO TÉCNICO · INSTALACIÓN POR EQUIPO');
      paragraph('Los componentes documentan el alcance de las líneas de servicios. No generan cargos duplicados.', { size: size(7.4), color: MUTED });
      invoice.installationBlocks.forEach((block, i) => {
        box(`EQUIPO ${String(i + 1).padStart(2, '0')} · ${block.brandModel}`, `${block.equipmentType}\nSerie: ${block.serialNumber || 'No especificada'} · Activo: ${block.assetCode || 'No especificado'}\nHardware: ${block.hardwareSpecs}\nModalidad: ${block.serviceModality}\nRespaldo previo: ${block.backupPerformed ? 'Realizado' : 'No realizado / No requerido'}. ${block.backupDetails}`, '#eef5ed');
        paragraph('A. SISTEMAS OPERATIVOS (SO)', { font: 'Strong', size: size(8), color: GREEN });
        if (!block.operatingSystems.length) paragraph('Sin intervención del sistema operativo.', { size: size(7.8), color: MUTED });
        for (const os of block.operatingSystems) {
          ensure(size(45)); paragraph(`${os.name} · ${os.editionVersion}`, { font: 'Strong', size: size(8.3), indent: 7, gap: 1 });
          paragraph(`${os.family} · ${os.architecture}\nIntervención: ${os.installType}\nParticiones: ${os.partitionScheme} · Licencia: ${os.licenseType}\nActualizaciones: ${os.updatesApplied ? 'Aplicadas y verificadas' : 'Pendientes de verificar'}\n${os.notes}`, { indent: 7, size: size(7.7), color: MUTED, gap: 9 });
        }
        paragraph('B. PROGRAMAS / APLICACIONES', { font: 'Strong', size: size(8), color: GREEN });
        if (!block.programs.length) paragraph('Sin aplicaciones adicionales.', { size: size(7.8), color: MUTED });
        for (const program of block.programs) { ensure(size(40)); paragraph(`${program.name} · ${program.version}`, { font: 'Strong', size: size(8.2), indent: 7, gap: 1 }); paragraph(`${program.category}\nLicencia: ${program.licenseType}\n${program.configurationNotes}`, { indent: 7, size: size(7.7), color: MUTED, gap: 9 }); }
        paragraph('C. CONTROLADORES (DRIVERS) / FIRMWARE', { font: 'Strong', size: size(8), color: GREEN });
        if (!block.drivers.length) paragraph('Sin controladores adicionales.', { size: size(7.8), color: MUTED });
        for (const driver of block.drivers) { ensure(size(45)); paragraph(driver.deviceName, { font: 'Strong', size: size(8.2), indent: 7, gap: 1 }); paragraph(`${driver.subsystem}\nFabricante: ${driver.manufacturer} · Versión: ${driver.driverVersion}\nFuente: ${driver.sourceType} · Estado: ${driver.verified ? 'Instalado y verificado' : 'Pendiente de verificar'}\n${driver.notes}`, { indent: 7, size: size(7.7), color: MUTED, gap: 9 }); }
        paragraph('D. VERIFICACIÓN DE ENTREGA', { font: 'Strong', size: size(8), color: GREEN });
        const v = block.verification;
        for (const [checked, label] of [[v.bootAndPerformanceOk, 'Arranque y rendimiento'], [v.deviceManagerClean, 'Dispositivos sin errores'], [v.networkAndPeripheralsOk, 'Red y periféricos operativos'], [v.dataIntegrityVerified, 'Integridad de datos']] as const) paragraph(`${checked ? '☑' : '☐'} ${label}: ${checked ? 'Verificado' : 'Pendiente / No aplica'}`, { size: size(7.7), indent: 7, gap: 1 });
        if (v.technicalObservations) paragraph(`Observaciones: ${v.technicalObservations}`, { size: size(7.7), color: MUTED, gap: 10 });
      });
    }
    section('III. PAGO, GARANTÍAS Y CONFORMIDAD CONTRACTUAL');
    box('INSTRUCCIONES DE PAGO DEL SUMINISTRADOR', `Método: ${invoice.paymentMethod}\nTitular: ${supplier.bankHolder}\nBanco: ${supplier.bankName}\nCuenta principal: ${supplier.bankAccount}\nCuenta alternativa: ${supplier.bankSecondaryAccount}`);
    if (invoice.warrantyNotes) paragraph(`Garantía: ${invoice.warrantyNotes}`, { size: size(8) });
    if (invoice.notes) paragraph(`Observaciones y entregables: ${invoice.notes}`, { size: size(8) });
    if (contract?.clausesSummary) paragraph(`Marco contractual: ${contract.clausesSummary}`, { size: size(7.8), color: MUTED });
    section('DECLARACIÓN DE RECEPCIÓN DEL CLIENTE FINAL');
    paragraph(invoice.acceptanceStatement, { size: size(8.2) });
    if (contract?.acceptanceClause && contract.acceptanceClause !== invoice.acceptanceStatement) paragraph(contract.acceptanceClause, { size: size(8) });
    const signatureWidth = (width - 22) / 2;
    const signatures = [{ title: 'EL SUMINISTRADOR · ENTREGA', png: invoice.supplierSignatureDataUrl, name: supplier.ownerName, metadata: `${supplier.ownerRole}\nID fiscal: ${supplier.taxId}` }, { title: 'EL CLIENTE FINAL · CONFORMIDAD', png: invoice.clientSignatureDataUrl, name: invoice.clientSignerName || client.representativeName, metadata: `${invoice.clientSignerRole || client.representativeRole}\nDoc.: ${invoice.clientSignerId || client.representativeId}\n${invoice.clientSignedAt ? `Fecha (UTC): ${invoice.clientSignedAt.replace('T', ' ').slice(0, 19)}` : 'Fecha: ____ / ____ / ______'}` }];
    const signatureLines = signatures.map(s => ({ title: split(s.title, signatureWidth - 16, 'Strong', size(7.5), GREEN), name: split(s.name, signatureWidth - 16, 'Strong', size(7.4)), meta: split(s.metadata, signatureWidth - 16, 'Body', size(6.9), MUTED) }));
    const signatureHeight = Math.max(...signatureLines.map(l => heightOf(l.title) + heightOf(l.name) + heightOf(l.meta))) + 76;
    ensure(signatureHeight + 14); y += 10;
    signatures.forEach((s, i) => { const x = left + i * (signatureWidth + 22); const lines = signatureLines[i]; const titleHeight = heightOf(lines.title); writeAt(lines.title, x + 8, y, signatureWidth - 16, 'center'); const png = dataUrlToPngBuffer(s.png); if (png) doc.image(png, x + 12, y + titleHeight + 9, { fit: [signatureWidth - 24, 42], align: 'center', valign: 'center' }); else writeAt(split('Espacio para firma manuscrita', signatureWidth - 16, 'Body', size(7), MUTED), x + 8, y + titleHeight + 22, signatureWidth - 16, 'center'); const lineY = y + titleHeight + 58; doc.moveTo(x + 8, lineY).lineTo(x + signatureWidth - 8, lineY).strokeColor('#b8cbb9').lineWidth(.6).stroke(); writeAt([...lines.name, ...lines.meta], x + 8, lineY + 6, signatureWidth - 16, 'center'); });
    y += signatureHeight + 12;
    if (invoice.signatureDocumentHash) paragraph(`Registro de integridad SHA-256: ${invoice.signatureDocumentHash}`, { size: size(6.6), color: MUTED });
    paragraph('Firma manuscrita electrónica, no firma digital certificada. La eficacia jurídica depende de la normativa y del acuerdo entre las partes. El estado de cobro puede actualizarse sin alterar el contenido aceptado.', { size: size(6.8), color: MUTED });
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i); const fy = dims.heightPt - dims.marginsPt.bottom + 2; doc.page.margins.bottom = 0;
      doc.moveTo(left, fy - 7).lineTo(left + width, fy - 7).strokeColor(BORDER).lineWidth(.5).stroke();
      writeAt(split(oneLine(`${invoice.invoiceNumber} · ${contract?.contractNumber || 'Sin contrato'} · ${paper} · ${orientation === 'portrait' ? 'Vertical' : 'Horizontal'}`, width * .78, size(6.1)), width * .78, 'Body', size(6.1), MUTED), left, fy, width * .78);
      writeAt(split(`${i + 1} / ${pages.count}`, width * .18, 'Body', size(6.4), MUTED), left + width * .82, fy, width * .18, 'right');
      if (invoice.isDemo) writeAt(split('DEMOSTRACIÓN · SIN VALIDEZ FISCAL', width, 'Body', size(5.8), '#b3966d'), left, fy + 12, width);
    }
    doc.end();
  });
}
