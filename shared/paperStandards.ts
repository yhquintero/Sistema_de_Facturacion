export type PaperSizeId =
  | 'A4'
  | 'LETTER'
  | 'LEGAL'
  | 'FOLIO'
  | 'A3'
  | 'A5'
  | 'B4'
  | 'B5'
  | 'EXECUTIVE'
  | 'TABLOID';

export type PaperOrientation = 'portrait' | 'landscape';

export interface InternationalPaperStandard {
  id: PaperSizeId;
  name: string;
  shortLabel: string;
  standardGroup: 'ISO 216 (Internacional)' | 'ANSI / América y Tradicional' | 'ISO Serie B';
  widthMm: number;
  heightMm: number;
  widthIn: number;
  heightIn: number;
  /** Código estándar ECMA-376 OpenXML worksheet pageSetup.paperSize */
  excelPaperCode: number;
  recommendedUse: string;
  defaultMarginsMm: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export const INTERNATIONAL_PAPER_STANDARDS: Record<PaperSizeId, InternationalPaperStandard> = {
  A4: {
    id: 'A4',
    name: 'ISO A4 Estándar Internacional',
    shortLabel: 'ISO A4 (210 × 297 mm)',
    standardGroup: 'ISO 216 (Internacional)',
    widthMm: 210,
    heightMm: 297,
    widthIn: 8.27,
    heightIn: 11.69,
    excelPaperCode: 9,
    recommendedUse: 'Estándar mundial para facturación comercial, contratos y anexos técnicos (Europa, América Latina, Caribe, ONU).',
    defaultMarginsMm: { top: 15, right: 15, bottom: 16, left: 15 },
  },
  LETTER: {
    id: 'LETTER',
    name: 'Carta / US Letter (ANSI A)',
    shortLabel: 'Carta / Letter (215.9 × 279.4 mm)',
    standardGroup: 'ANSI / América y Tradicional',
    widthMm: 215.9,
    heightMm: 279.4,
    widthIn: 8.5,
    heightIn: 11.0,
    excelPaperCode: 1,
    recommendedUse: 'Estándar empresarial en Norteamérica, Caribe, México, Centroamérica, Colombia y Chile.',
    defaultMarginsMm: { top: 14, right: 15, bottom: 15, left: 15 },
  },
  LEGAL: {
    id: 'LEGAL',
    name: 'Oficio / US Legal',
    shortLabel: 'Oficio Legal (215.9 × 355.6 mm)',
    standardGroup: 'ANSI / América y Tradicional',
    widthMm: 215.9,
    heightMm: 355.6,
    widthIn: 8.5,
    heightIn: 14.0,
    excelPaperCode: 5,
    recommendedUse: 'Óptimo para facturas extensas con cláusulas contractuales y actas detalladas con firmas.',
    defaultMarginsMm: { top: 16, right: 15, bottom: 16, left: 15 },
  },
  FOLIO: {
    id: 'FOLIO',
    name: 'Oficio Hispanoamericano / Folio (8.5 × 13")',
    shortLabel: 'Folio / Oficio 13" (215.9 × 330.2 mm)',
    standardGroup: 'ANSI / América y Tradicional',
    widthMm: 215.9,
    heightMm: 330.2,
    widthIn: 8.5,
    heightIn: 13.0,
    excelPaperCode: 14,
    recommendedUse: 'Formato tradicional de Oficio / Folio administrativo e institucional en Iberoamérica.',
    defaultMarginsMm: { top: 15, right: 15, bottom: 16, left: 15 },
  },
  A3: {
    id: 'A3',
    name: 'ISO A3 Formato Amplio',
    shortLabel: 'ISO A3 (297 × 420 mm)',
    standardGroup: 'ISO 216 (Internacional)',
    widthMm: 297,
    heightMm: 420,
    widthIn: 11.69,
    heightIn: 16.54,
    excelPaperCode: 8,
    recommendedUse: 'Desgloses multi-servidor, inventarios de parque informático y cuadros técnicos detallados.',
    defaultMarginsMm: { top: 18, right: 18, bottom: 18, left: 18 },
  },
  A5: {
    id: 'A5',
    name: 'ISO A5 Comprobante Compacto',
    shortLabel: 'ISO A5 (148 × 210 mm)',
    standardGroup: 'ISO 216 (Internacional)',
    widthMm: 148,
    heightMm: 210,
    widthIn: 5.83,
    heightIn: 8.27,
    excelPaperCode: 11,
    recommendedUse: 'Comprobantes compactos de servicio técnico rápido, taller y asistencia presencial.',
    defaultMarginsMm: { top: 10, right: 10, bottom: 11, left: 10 },
  },
  B4: {
    id: 'B4',
    name: 'ISO B4 Técnico / Financiero',
    shortLabel: 'ISO B4 (250 × 353 mm)',
    standardGroup: 'ISO Serie B',
    widthMm: 250,
    heightMm: 353,
    widthIn: 9.84,
    heightIn: 13.9,
    excelPaperCode: 42,
    recommendedUse: 'Formato intermedio amplio para reportes financieros y certificaciones de despliegue.',
    defaultMarginsMm: { top: 16, right: 16, bottom: 16, left: 16 },
  },
  B5: {
    id: 'B5',
    name: 'ISO B5 Ejecutivo Internacional',
    shortLabel: 'ISO B5 (176 × 250 mm)',
    standardGroup: 'ISO Serie B',
    widthMm: 176,
    heightMm: 250,
    widthIn: 6.93,
    heightIn: 9.84,
    excelPaperCode: 0, // ISO B5 requires explicit paperWidth/paperHeight; code 13 is JIS B5.
    recommendedUse: 'Formato gerencial compacto para minutas de entrega y facturación ágil.',
    defaultMarginsMm: { top: 12, right: 12, bottom: 12, left: 12 },
  },
  EXECUTIVE: {
    id: 'EXECUTIVE',
    name: 'Ejecutivo / US Executive',
    shortLabel: 'Executive (184.2 × 266.7 mm)',
    standardGroup: 'ANSI / América y Tradicional',
    widthMm: 184.15,
    heightMm: 266.7,
    widthIn: 7.25,
    heightIn: 10.5,
    excelPaperCode: 7,
    recommendedUse: 'Papelería corporativa ejecutiva y resúmenes de consultoría de software.',
    defaultMarginsMm: { top: 12, right: 13, bottom: 13, left: 13 },
  },
  TABLOID: {
    id: 'TABLOID',
    name: 'Tabloide / Ledger (ANSI B)',
    shortLabel: 'Tabloide (279.4 × 431.8 mm)',
    standardGroup: 'ANSI / América y Tradicional',
    widthMm: 279.4,
    heightMm: 431.8,
    widthIn: 11.0,
    heightIn: 17.0,
    excelPaperCode: 3,
    recommendedUse: 'Sábanas de auditoría técnica, despliegues masivos de estaciones y servidores.',
    defaultMarginsMm: { top: 18, right: 18, bottom: 18, left: 18 },
  },
};

export const PAPER_STANDARDS_LIST: InternationalPaperStandard[] = Object.values(
  INTERNATIONAL_PAPER_STANDARDS
);

/** Convierte milímetros a puntos PostScript (1 inch = 25.4 mm = 72 pt) */
export function mmToPt(mm: number): number {
  return Math.round(((mm * 72) / 25.4) * 100) / 100;
}

/** Convierte milímetros a twips OpenXML (1 inch = 25.4 mm = 1440 twips) */
export function mmToTwips(mm: number): number {
  return Math.round((mm * 1440) / 25.4);
}

/** Convierte milímetros a pulgadas */
export function mmToInches(mm: number): number {
  return Math.round((mm / 25.4) * 1000) / 1000;
}

export interface ResolvedPageDimensions {
  standard: InternationalPaperStandard;
  orientation: PaperOrientation;
  widthMm: number;
  heightMm: number;
  widthPt: number;
  heightPt: number;
  widthTwips: number;
  heightTwips: number;
  marginsPt: { top: number; right: number; bottom: number; left: number };
  marginsTwips: { top: number; right: number; bottom: number; left: number };
  marginsIn: { top: number; right: number; bottom: number; left: number };
  printableWidthPt: number;
  printableWidthTwips: number;
}

export function resolvePageDimensions(
  paperId: PaperSizeId = 'A4',
  orientation: PaperOrientation = 'portrait'
): ResolvedPageDimensions {
  const standard = INTERNATIONAL_PAPER_STANDARDS[paperId] || INTERNATIONAL_PAPER_STANDARDS.A4;
  const widthMm = orientation === 'landscape' ? standard.heightMm : standard.widthMm;
  const heightMm = orientation === 'landscape' ? standard.widthMm : standard.heightMm;

  const m = standard.defaultMarginsMm;
  const widthPt = mmToPt(widthMm);
  const heightPt = mmToPt(heightMm);
  const widthTwips = mmToTwips(widthMm);
  const heightTwips = mmToTwips(heightMm);

  const marginsPt = {
    top: mmToPt(m.top),
    right: mmToPt(m.right),
    bottom: mmToPt(m.bottom),
    left: mmToPt(m.left),
  };

  const marginsTwips = {
    top: mmToTwips(m.top),
    right: mmToTwips(m.right),
    bottom: mmToTwips(m.bottom),
    left: mmToTwips(m.left),
  };

  const marginsIn = {
    top: mmToInches(m.top),
    right: mmToInches(m.right),
    bottom: mmToInches(m.bottom),
    left: mmToInches(m.left),
  };

  return {
    standard,
    orientation,
    widthMm,
    heightMm,
    widthPt,
    heightPt,
    widthTwips,
    heightTwips,
    marginsPt,
    marginsTwips,
    marginsIn,
    printableWidthPt: widthPt - marginsPt.left - marginsPt.right,
    printableWidthTwips: widthTwips - marginsTwips.left - marginsTwips.right,
  };
}
