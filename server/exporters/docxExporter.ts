import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import {
  mmToTwips,
  resolvePageDimensions,
  type PaperOrientation,
  type PaperSizeId,
} from '../../shared/paperStandards';
import type { Invoice } from '../../shared/types';
import { dataUrlToPngBuffer } from '../utils/signaturePng';
import {
  activityLabel,
  formatMoney,
  formatMoneyCompact,
  scopeLabel,
  statusLabel,
} from './formatHelpers';

const NAVY = '294F40';
const SLATE = '334155';
const MUTED = '64748B';
const BORDER = 'CBD5E1';
const LIGHT_BG = 'F8FAFC';
const TINT_BLUE = 'F0F5EE';
const TINT_EMERALD = 'EEF5ED';
const TINT_AMBER = 'FFFBEB';

const stdBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
};

const cellMargins = { top: 90, bottom: 90, left: 120, right: 120 };

export async function generateInvoiceDocxBuffer(
  invoice: Invoice,
  paperSize: PaperSizeId = 'A4',
  orientation: PaperOrientation = 'portrait'
): Promise<Buffer> {
  const dims = resolvePageDimensions(paperSize, orientation);
  const totalTwips = dims.printableWidthTwips;
  const isCompact = dims.widthMm < 185;
  const sz = (halfPts: number) => (isCompact ? Math.max(13, Math.round(halfPts * 0.86)) : halfPts);

  const supplier = invoice.supplier!;
  const client = invoice.client!;
  const contract = invoice.contract;

  const children: (Paragraph | Table)[] = [];
  if (invoice.isDemo) children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'DOCUMENTO DE DEMOSTRACIÓN · SIN VALIDEZ FISCAL · Firmas de ejemplo', bold: true, color: 'AA8051', size: sz(17), font: 'Calibri' })] }));

  // ===========================================================================
  // 1. TABLA DE CABECERA EJECUTIVA
  // ===========================================================================
  const headLeftW = Math.round(totalTwips * 0.63);
  const headRightW = totalTwips - headLeftW;

  children.push(
    new Table({
      columnWidths: [headLeftW, headRightW],
      width: { size: totalTwips, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: headLeftW, type: WidthType.DXA },
              shading: { fill: NAVY, type: ShadingType.CLEAR },
              margins: { top: 150, bottom: 150, left: 180, right: 140 },
              borders: stdBorders,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: supplier.businessName,
                      bold: true,
                      color: 'FFFFFF',
                      size: sz(24),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 60 },
                  children: [
                    new TextRun({
                      text: `${supplier.ownerName}  |  NIT/ID: ${supplier.taxId}  |  Reg: ${supplier.registryNumber}`,
                      color: 'E2E8F0',
                      size: sz(17),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 30 },
                  children: [
                    new TextRun({
                      text: `${supplier.address} • Tel: ${supplier.phone} • ${supplier.email}`,
                      color: 'CBD5E1',
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: headRightW, type: WidthType.DXA },
              shading: { fill: NAVY, type: ShadingType.CLEAR },
              margins: { top: 150, bottom: 150, left: 140, right: 180 },
              verticalAlign: VerticalAlign.CENTER,
              borders: stdBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: 'FACTURA Y ACTA DE CONFORMIDAD',
                      bold: true,
                      color: '93C5FD',
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 40 },
                  children: [
                    new TextRun({
                      text: invoice.invoiceNumber,
                      bold: true,
                      color: 'FFFFFF',
                      size: sz(28),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 40 },
                  children: [
                    new TextRun({
                      text: `Emisión: ${invoice.issueDate}  |  Vence: ${invoice.dueDate}`,
                      color: 'E2E8F0',
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `Estado: ${statusLabel(invoice.status)}  |  Hoja: ${dims.standard.id}`,
                      color: 'CBD5E1',
                      size: sz(15),
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // ===========================================================================
  // 2. ALCANCE DE ACTIVIDADES DE EL SUMINISTRADOR
  // ===========================================================================
  const actParagraphs: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: `OBJETO SOCIAL Y ACTIVIDADES DE EL SUMINISTRADOR — ${scopeLabel(invoice.activityScope).toUpperCase()}`,
          bold: true,
          color: NAVY,
          size: sz(17),
          font: 'Calibri',
        }),
      ],
    }),
  ];

  if (invoice.activityScope === 'principal' || invoice.activityScope === 'ambas') {
    actParagraphs.push(
      new Paragraph({
        spacing: { before: 50 },
        children: [
          new TextRun({ text: '• Actividad Principal: ', bold: true, color: NAVY, size: sz(16), font: 'Calibri' }),
          new TextRun({ text: supplier.primaryActivity, color: SLATE, size: sz(16), font: 'Calibri' }),
        ],
      })
    );
  }
  if (invoice.activityScope === 'secundaria' || invoice.activityScope === 'ambas') {
    actParagraphs.push(
      new Paragraph({
        spacing: { before: 50 },
        children: [
          new TextRun({ text: '• Actividad Secundaria: ', bold: true, color: NAVY, size: sz(16), font: 'Calibri' }),
          new TextRun({ text: supplier.secondaryActivity, color: SLATE, size: sz(16), font: 'Calibri' }),
        ],
      })
    );
  }

  children.push(new Paragraph({ spacing: { before: 100 } }));
  children.push(
    new Table({
      columnWidths: [totalTwips],
      width: { size: totalTwips, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: totalTwips, type: WidthType.DXA },
              shading: { fill: TINT_BLUE, type: ShadingType.CLEAR },
              margins: cellMargins,
              borders: stdBorders,
              children: actParagraphs,
            }),
          ],
        }),
      ],
    })
  );

  // ===========================================================================
  // 3. TABLA BILATERAL: CLIENTE FINAL Y MARCO CONTRACTUAL
  // ===========================================================================
  const halfW = Math.floor(totalTwips / 2);
  const halfW2 = totalTwips - halfW;

  children.push(new Paragraph({ spacing: { before: 100 } }));
  children.push(
    new Table({
      columnWidths: [halfW, halfW2],
      width: { size: totalTwips, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: halfW, type: WidthType.DXA },
              shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
              margins: cellMargins,
              borders: stdBorders,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'EL CLIENTE FINAL',
                      bold: true,
                      color: NAVY,
                      size: sz(18),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 40 },
                  children: [
                    new TextRun({ text: `${client.name}`, bold: true, color: SLATE, size: sz(17), font: 'Calibri' }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${client.clientType}  |  NIT/CI: ${client.taxId}`,
                      color: SLATE,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Dirección: ${client.address}, ${client.city}`,
                      color: SLATE,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Tel: ${client.phone}  |  ${client.email}`,
                      color: SLATE,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Representante Receptor: ${client.representativeName} (${client.representativeRole}) — ID: ${client.representativeId}`,
                      color: NAVY,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: halfW2, type: WidthType.DXA },
              shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
              margins: cellMargins,
              borders: stdBorders,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'CONTRATO SUMINISTRADOR ↔ CLIENTE',
                      bold: true,
                      color: NAVY,
                      size: sz(18),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 40 },
                  children: [
                    new TextRun({
                      text: contract
                        ? `Contrato Nº: ${contract.contractNumber} (${contract.status.toUpperCase()})`
                        : 'Modalidad: Orden de Servicio Directa',
                      bold: true,
                      color: SLATE,
                      size: sz(17),
                      font: 'Calibri',
                    }),
                  ],
                }),
                ...(contract
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Objeto: ${contract.title}`,
                            color: SLATE,
                            size: sz(16),
                            font: 'Calibri',
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Vigencia: ${contract.startDate} al ${contract.endDate}`,
                            color: SLATE,
                            size: sz(16),
                            font: 'Calibri',
                          }),
                        ],
                      }),
                    ]
                  : []),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Ejecución: ${invoice.serviceModality} (${invoice.serviceLocation || client.city})`,
                      color: SLATE,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Forma de Pago: ${invoice.paymentMethod}`,
                      color: NAVY,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // ===========================================================================
  // 4. SECCIÓN I: TABLA DETALLADA DE SERVICIOS
  // ===========================================================================
  children.push(
    new Paragraph({
      spacing: { before: 180, after: 80 },
      children: [
        new TextRun({
          text: 'I. DESGLOSE ECONÓMICO DE SERVICIOS Y ENTREGABLES',
          bold: true,
          color: NAVY,
          size: sz(20),
          font: 'Calibri',
        }),
      ],
    })
  );

  const c1 = Math.round(totalTwips * 0.1);
  const c2 = Math.round(totalTwips * 0.15);
  const c3 = Math.round(totalTwips * 0.37);
  const c4 = Math.round(totalTwips * 0.08);
  const c5 = Math.round(totalTwips * 0.07);
  const c6 = Math.round(totalTwips * 0.11);
  const c7 = totalTwips - (c1 + c2 + c3 + c4 + c5 + c6);
  const itemColWidths = [c1, c2, c3, c4, c5, c6, c7];

  const makeHeaderCell = (label: string, width: number, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      margins: cellMargins,
      borders: stdBorders,
      children: [
        new Paragraph({
          alignment: align,
          children: [
            new TextRun({ text: label, bold: true, color: 'FFFFFF', size: sz(16), font: 'Calibri' }),
          ],
        }),
      ],
    });

  const itemRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        makeHeaderCell('CÓDIGO', c1),
        makeHeaderCell('ACTIVIDAD', c2),
        makeHeaderCell('DESCRIPCIÓN DETALLADA', c3),
        makeHeaderCell('U/M', c4, AlignmentType.CENTER),
        makeHeaderCell('CANT.', c5, AlignmentType.RIGHT),
        makeHeaderCell('P. UNIT.', c6, AlignmentType.RIGHT),
        makeHeaderCell('IMPORTE', c7, AlignmentType.RIGHT),
      ],
    }),
  ];

  invoice.items.forEach((it, idx) => {
    const rowFill = idx % 2 === 0 ? 'FFFFFF' : LIGHT_BG;
    itemRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: c1, type: WidthType.DXA },
            shading: { fill: rowFill, type: ShadingType.CLEAR },
            margins: cellMargins,
            borders: stdBorders,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: it.code || `#${idx + 1}`, bold: true, color: NAVY, size: sz(16), font: 'Calibri' }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: c2, type: WidthType.DXA },
            shading: { fill: rowFill, type: ShadingType.CLEAR },
            margins: cellMargins,
            borders: stdBorders,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: activityLabel(it.activityType),
                    bold: true,
                    color: it.activityType === 'principal' ? '1D4ED8' : '0F766E',
                    size: sz(15),
                    font: 'Calibri',
                  }),
                ],
              }),
              ...(it.category
                ? [
                    new Paragraph({
                      children: [
                        new TextRun({ text: it.category, color: MUTED, size: sz(14), font: 'Calibri' }),
                      ],
                    }),
                  ]
                : []),
            ],
          }),
          new TableCell({
            width: { size: c3, type: WidthType.DXA },
            shading: { fill: rowFill, type: ShadingType.CLEAR },
            margins: cellMargins,
            borders: stdBorders,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: it.title, bold: true, color: NAVY, size: sz(16), font: 'Calibri' }),
                ],
              }),
              ...(it.description
                ? [
                    new Paragraph({
                      spacing: { before: 30 },
                      children: [
                        new TextRun({ text: it.description, color: SLATE, size: sz(15), font: 'Calibri' }),
                      ],
                    }),
                  ]
                : []),
            ],
          }),
          new TableCell({
            width: { size: c4, type: WidthType.DXA },
            shading: { fill: rowFill, type: ShadingType.CLEAR },
            margins: cellMargins,
            borders: stdBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: it.unit, color: SLATE, size: sz(16), font: 'Calibri' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: c5, type: WidthType.DXA },
            shading: { fill: rowFill, type: ShadingType.CLEAR },
            margins: cellMargins,
            borders: stdBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: String(it.quantity), color: SLATE, size: sz(16), font: 'Calibri' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: c6, type: WidthType.DXA },
            shading: { fill: rowFill, type: ShadingType.CLEAR },
            margins: cellMargins,
            borders: stdBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: formatMoneyCompact(it.unitPrice, invoice.currency),
                    color: SLATE,
                    size: sz(16),
                    font: 'Calibri',
                  }),
                ],
              }),
              ...(it.discountPercent > 0
                ? [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [
                        new TextRun({
                          text: `-${it.discountPercent}%`,
                          color: 'B91C1C',
                          size: sz(14),
                          font: 'Calibri',
                        }),
                      ],
                    }),
                  ]
                : []),
            ],
          }),
          new TableCell({
            width: { size: c7, type: WidthType.DXA },
            shading: { fill: rowFill, type: ShadingType.CLEAR },
            margins: cellMargins,
            borders: stdBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: formatMoneyCompact(it.lineTotal, invoice.currency),
                    bold: true,
                    color: NAVY,
                    size: sz(16),
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  });

  children.push(
    new Table({
      columnWidths: itemColWidths,
      width: { size: totalTwips, type: WidthType.DXA },
      rows: itemRows,
    })
  );

  // Resumen Bancario + Totales
  const bankW = Math.round(totalTwips * 0.57);
  const totW = totalTwips - bankW;

  children.push(new Paragraph({ spacing: { before: 100 } }));
  children.push(
    new Table({
      columnWidths: [bankW, totW],
      width: { size: totalTwips, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: bankW, type: WidthType.DXA },
              shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
              margins: cellMargins,
              borders: stdBorders,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'CUENTAS DE PAGO DE EL SUMINISTRADOR',
                      bold: true,
                      color: NAVY,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 30 },
                  children: [
                    new TextRun({
                      text: `Titular: ${supplier.bankHolder}  |  Banco: ${supplier.bankName}`,
                      color: SLATE,
                      size: sz(15),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Cuenta Principal: ${supplier.bankAccount}`,
                      color: SLATE,
                      size: sz(15),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Cuenta Alterna: ${supplier.bankSecondaryAccount}`,
                      color: SLATE,
                      size: sz(15),
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: totW, type: WidthType.DXA },
              margins: cellMargins,
              borders: stdBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: 'Subtotal Bruto:  ', color: SLATE, size: sz(16), font: 'Calibri' }),
                    new TextRun({
                      text: formatMoney(invoice.subtotal, invoice.currency),
                      bold: true,
                      color: NAVY,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: 'Descuentos:  ', color: SLATE, size: sz(16), font: 'Calibri' }),
                    new TextRun({
                      text: `-${formatMoney(invoice.discountTotal, invoice.currency)}`,
                      color: SLATE,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `${invoice.taxName} (${invoice.taxRate}%):  `,
                      color: SLATE,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                    new TextRun({
                      text: formatMoney(invoice.taxAmount, invoice.currency),
                      color: NAVY,
                      size: sz(16),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 60 },
                  children: [
                    new TextRun({
                      text: `TOTAL A PAGAR:  ${formatMoney(invoice.total, invoice.currency)}`,
                      bold: true,
                      color: NAVY,
                      size: sz(21),
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // ===========================================================================
  // 5. SECCIÓN II: DESGLOSE TÉCNICO PERFECCIONADO DE INSTALACIÓN
  //    (SO, PROGRAMAS Y DRIVERS)
  // ===========================================================================
  if (invoice.installationBlocks && invoice.installationBlocks.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: 'II. DESGLOSE TÉCNICO DETALLADO — APARTADO DE INSTALACIÓN (SISTEMAS OPERATIVOS, PROGRAMAS Y DRIVERS)',
            bold: true,
            color: NAVY,
            size: sz(20),
            font: 'Calibri',
          }),
        ],
      })
    );

    const kCol1 = Math.round(totalTwips * 0.23);
    const kCol2 = Math.round(totalTwips * 0.42);
    const kCol3 = totalTwips - kCol1 - kCol2;

    invoice.installationBlocks.forEach((block, bIdx) => {
      const techRows: TableRow[] = [
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 3,
              width: { size: totalTwips, type: WidthType.DXA },
              shading: { fill: TINT_EMERALD, type: ShadingType.CLEAR },
              margins: cellMargins,
              borders: stdBorders,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `EQUIPO #${bIdx + 1}: [${block.equipmentType}] ${block.brandModel}  |  Nº Serie: ${block.serialNumber || 'S/N'}  |  Activo: ${block.assetCode || 'N/A'}`,
                      bold: true,
                      color: '065F46',
                      size: sz(17),
                      font: 'Calibri',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Hardware: ${block.hardwareSpecs}  |  Modalidad: ${block.serviceModality}  |  Respaldo: ${
                        block.backupPerformed ? `SÍ (${block.backupDetails})` : `No realizado / No requerido. ${block.backupDetails}`
                      }`,
                      color: SLATE,
                      size: sz(15),
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          tableHeader: true,
          children: [
            makeHeaderCell('COMPONENTE / CATEGORÍA', kCol1),
            makeHeaderCell('SISTEMA OPERATIVO / PROGRAMA / DRIVER', kCol2),
            makeHeaderCell('ESPECIFICACIÓN TÉCNICA, LICENCIA Y VERIFICACIÓN', kCol3),
          ],
        }),
      ];

      for (const os of block.operatingSystems) {
        techRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: kCol1, type: WidthType.DXA },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'SISTEMA OPERATIVO', bold: true, color: '1D4ED8', size: sz(15), font: 'Calibri' }),
                    ],
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: os.family, color: MUTED, size: sz(14), font: 'Calibri' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: kCol2, type: WidthType.DXA },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: os.name, bold: true, color: NAVY, size: sz(16), font: 'Calibri' })],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Edición: ${os.editionVersion} (${os.architecture})`,
                        color: SLATE,
                        size: sz(15),
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: kCol3, type: WidthType.DXA },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${os.installType} | ${os.partitionScheme} | ${os.licenseType} | Updates: ${
                          os.updatesApplied ? 'Sí' : 'No'
                        }`,
                        color: SLATE,
                        size: sz(15),
                        font: 'Calibri',
                      }),
                    ],
                  }),
                  ...(os.notes
                    ? [
                        new Paragraph({
                          children: [new TextRun({ text: os.notes, color: MUTED, size: sz(14), font: 'Calibri' })],
                        }),
                      ]
                    : []),
                ],
              }),
            ],
          })
        );
      }

      for (const prg of block.programs) {
        techRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: kCol1, type: WidthType.DXA },
                shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'PROGRAMA / SUITE', bold: true, color: '0F766E', size: sz(15), font: 'Calibri' }),
                    ],
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: prg.category, color: MUTED, size: sz(14), font: 'Calibri' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: kCol2, type: WidthType.DXA },
                shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: prg.name, bold: true, color: NAVY, size: sz(16), font: 'Calibri' })],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: `Versión: ${prg.version}`, color: SLATE, size: sz(15), font: 'Calibri' }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: kCol3, type: WidthType.DXA },
                shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: `Licencia: ${prg.licenseType}`, color: SLATE, size: sz(15), font: 'Calibri' }),
                    ],
                  }),
                  ...(prg.configurationNotes
                    ? [
                        new Paragraph({
                          children: [
                            new TextRun({ text: prg.configurationNotes, color: MUTED, size: sz(14), font: 'Calibri' }),
                          ],
                        }),
                      ]
                    : []),
                ],
              }),
            ],
          })
        );
      }

      for (const drv of block.drivers) {
        techRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: kCol1, type: WidthType.DXA },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'DRIVER / HARDWARE', bold: true, color: '7C3AED', size: sz(15), font: 'Calibri' }),
                    ],
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: drv.subsystem, color: MUTED, size: sz(14), font: 'Calibri' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: kCol2, type: WidthType.DXA },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: drv.deviceName, bold: true, color: NAVY, size: sz(16), font: 'Calibri' }),
                    ],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Fabricante: ${drv.manufacturer}  |  Ver: ${drv.driverVersion}`,
                        color: SLATE,
                        size: sz(15),
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: kCol3, type: WidthType.DXA },
                margins: cellMargins,
                borders: stdBorders,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${drv.sourceType} — ${drv.verified ? 'VERIFICADO OK' : 'En revisión'}`,
                        bold: true,
                        color: drv.verified ? '065F46' : 'B45309',
                        size: sz(15),
                        font: 'Calibri',
                      }),
                    ],
                  }),
                  ...(drv.notes
                    ? [
                        new Paragraph({
                          children: [new TextRun({ text: drv.notes, color: MUTED, size: sz(14), font: 'Calibri' })],
                        }),
                      ]
                    : []),
                ],
              }),
            ],
          })
        );
      }

      const v = block.verification;
      techRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 3,
              width: { size: totalTwips, type: WidthType.DXA },
              shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
              margins: cellMargins,
              borders: stdBorders,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Verificación Técnica: [${v.bootAndPerformanceOk ? '✓' : ' '}] Arranque óptimo   [${
                        v.deviceManagerClean ? '✓' : ' '
                      }] Cero conflictos de drivers   [${
                        v.networkAndPeripheralsOk ? '✓' : ' '
                      }] Red y periféricos OK   [${v.dataIntegrityVerified ? '✓' : ' '}] Datos íntegros.`,
                      bold: true,
                      color: NAVY,
                      size: sz(15),
                      font: 'Calibri',
                    }),
                  ],
                }),
                ...(v.technicalObservations
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Observaciones Técnicas: ${v.technicalObservations}`,
                            color: SLATE,
                            size: sz(15),
                            font: 'Calibri',
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
          ],
        })
      );

      children.push(
        new Table({
          columnWidths: [kCol1, kCol2, kCol3],
          width: { size: totalTwips, type: WidthType.DXA },
          rows: techRows,
        })
      );
      children.push(new Paragraph({ spacing: { before: 100 } }));
    });
  }

  if (contract) {
    for (const text of [`CONDICIONES CONTRACTUALES · ${contract.contractNumber}`, `Condiciones de pago: ${contract.paymentTerms}`, `Cláusulas y obligaciones: ${contract.clausesSummary}`, ...(contract.acceptanceClause !== invoice.acceptanceStatement ? [`Cláusula de recepción: ${contract.acceptanceClause}`] : [])]) children.push(new Paragraph({ spacing: { before: 100, after: 60 }, children: [new TextRun({ text, color: SLATE, size: sz(17), font: 'Calibri' })] }));
  }
  if (invoice.notes) children.push(new Paragraph({ spacing: { before: 100, after: 60 }, children: [new TextRun({ text: `Observaciones y entregables: ${invoice.notes}`, color: SLATE, size: sz(17), font: 'Calibri' })] }));

  // ===========================================================================
  // 6. SECCIÓN III: CLÁUSULA CONTRACTUAL Y BLOQUE DE FIRMAS
  // ===========================================================================
  children.push(
    new Paragraph({
      spacing: { before: 140, after: 80 },
      children: [
        new TextRun({
          text: 'III. GARANTÍA, CONFORMIDAD Y FIRMA DEL CLIENTE FINAL SEGÚN CONTRATO',
          bold: true,
          color: NAVY,
          size: sz(20),
          font: 'Calibri',
        }),
      ],
    })
  );

  children.push(
    new Table({
      columnWidths: [totalTwips],
      width: { size: totalTwips, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: totalTwips, type: WidthType.DXA },
              shading: { fill: TINT_AMBER, type: ShadingType.CLEAR },
              margins: cellMargins,
              borders: stdBorders,
              children: [
                ...(invoice.warrantyNotes
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: 'Garantía Técnica Aplicable: ',
                            bold: true,
                            color: '78350F',
                            size: sz(16),
                            font: 'Calibri',
                          }),
                          new TextRun({
                            text: invoice.warrantyNotes,
                            color: '78350F',
                            size: sz(15),
                            font: 'Calibri',
                          }),
                        ],
                      }),
                    ]
                  : []),
                new Paragraph({
                  spacing: { before: 50 },
                  children: [
                    new TextRun({
                      text: 'Declaración Contractual de Recepción y Conformidad: ',
                      bold: true,
                      color: '78350F',
                      size: sz(16),
                      font: 'Calibri',
                    }),
                    new TextRun({
                      text: invoice.acceptanceStatement,
                      color: '78350F',
                      size: sz(15),
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  const supPng = dataUrlToPngBuffer(invoice.supplierSignatureDataUrl || supplier.supplierSignatureDataUrl);
  const cliPng = dataUrlToPngBuffer(invoice.clientSignatureDataUrl);

  const supplierSigChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'ENTREGADO POR EL SUMINISTRADOR',
          bold: true,
          color: NAVY,
          size: sz(17),
          font: 'Calibri',
        }),
      ],
    }),
  ];

  if (supPng) {
    supplierSigChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 40 },
        children: [
          new ImageRun({
            data: supPng,
            transformation: { width: 140, height: 44 },
            type: 'png',
          }),
        ],
      })
    );
  } else {
    supplierSigChildren.push(new Paragraph({ spacing: { before: 560 } }));
  }

  supplierSigChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: '________________________________________', color: SLATE, size: sz(16), font: 'Calibri' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: supplier.ownerName, bold: true, color: NAVY, size: sz(16), font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${supplier.ownerRole} • ID Fiscal: ${supplier.taxId}`,
          color: MUTED,
          size: sz(14),
          font: 'Calibri',
        }),
      ],
    })
  );

  const clientSigChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'RECIBIDO CONFORME — EL CLIENTE FINAL',
          bold: true,
          color: NAVY,
          size: sz(17),
          font: 'Calibri',
        }),
      ],
    }),
  ];

  if (cliPng) {
    clientSigChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 40 },
        children: [
          new ImageRun({
            data: cliPng,
            transformation: { width: 140, height: 44 },
            type: 'png',
          }),
        ],
      })
    );
  } else {
    clientSigChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 260, after: 220 },
        children: [
          new TextRun({
            text: '[ Firma manuscrita y cuño/sello del Cliente Final ]',
            italics: true,
            color: '94A3B8',
            size: sz(15),
            font: 'Calibri',
          }),
        ],
      })
    );
  }

  const signerName = invoice.clientSignerName || client.representativeName || 'Nombre y Apellidos: ___________________';
  const signerDoc = invoice.clientSignerId || client.representativeId || '_______________';
  const signerRole = invoice.clientSignerRole || client.representativeRole || 'Representante';
  const signedDate = invoice.clientSignedAt
    ? invoice.clientSignedAt.slice(0, 16).replace('T', ' ')
    : '____/____/202__';

  clientSigChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: '________________________________________', color: SLATE, size: sz(16), font: 'Calibri' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: signerName, bold: true, color: NAVY, size: sz(16), font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${signerRole} • Doc. ID: ${signerDoc} • Fecha: ${signedDate}`,
          color: MUTED,
          size: sz(14),
          font: 'Calibri',
        }),
      ],
    })
  );

  children.push(new Paragraph({ spacing: { before: 120 } }));
  children.push(
    new Table({
      columnWidths: [halfW, halfW2],
      width: { size: totalTwips, type: WidthType.DXA },
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: halfW, type: WidthType.DXA },
              margins: cellMargins,
              borders: stdBorders,
              children: supplierSigChildren,
            }),
            new TableCell({
              width: { size: halfW2, type: WidthType.DXA },
              margins: cellMargins,
              borders: stdBorders,
              children: clientSigChildren,
            }),
          ],
        }),
      ],
    })
  );

  if (invoice.signatureDocumentHash) children.push(new Paragraph({ spacing: { before: 140 }, children: [new TextRun({ text: `Registro de integridad SHA-256: ${invoice.signatureDocumentHash}`, color: MUTED, size: sz(14), font: 'Calibri' })] }));
  children.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: 'Firma manuscrita electrónica, no firma digital certificada. Esta copia editable no está protegida por un certificado digital. La integridad del contenido original se comprueba en el servidor. El estado de cobro puede cambiar sin alterar el contenido aceptado.', color: MUTED, size: sz(14), font: 'Calibri' })] }));
  const doc = new Document({
    creator: supplier.ownerName,
    title: `Factura ${invoice.invoiceNumber}`,
    description: `Factura y Acta de Conformidad en estándar ${dims.standard.shortLabel}`,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: mmToTwips(dims.standard.widthMm),
              height: mmToTwips(dims.standard.heightMm),
              orientation:
                orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: dims.marginsTwips.top,
              right: dims.marginsTwips.right,
              bottom: dims.marginsTwips.bottom,
              left: dims.marginsTwips.left,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${invoice.isDemo ? 'DEMOSTRACIÓN · ' : ''}${invoice.invoiceNumber} • Contrato: ${
                      contract ? contract.contractNumber : 'Directo'
                    } • Hoja Internacional: ${dims.standard.shortLabel}  |  Página `,
                    color: MUTED,
                    size: 15,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: MUTED,
                    size: 15,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    text: ' de ',
                    color: MUTED,
                    size: 15,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    color: MUTED,
                    size: 15,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
