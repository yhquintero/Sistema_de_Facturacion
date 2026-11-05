import Decimal from 'decimal.js';
import type { InvoiceLineItem } from './types';

// Decimal operands avoid binary floating-point errors (e.g. 2.5 × 19.99 = 49.975).
// Commercial rounding: HALF_UP to two decimals, gross/discount per line, then tax on net.
const rounded = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export function roundMoney(value: number): number { return rounded(value).toNumber(); }
export function lineGross(quantity: number, unitPrice: number): number { return rounded(new Decimal(quantity).mul(unitPrice)).toNumber(); }
export function calculateInvoiceTotals(source: InvoiceLineItem[], taxRate: number) {
  const items = source.map(item => {
    const gross = rounded(new Decimal(item.quantity).mul(item.unitPrice));
    const discount = rounded(gross.mul(item.discountPercent).div(100));
    return { ...item, lineTotal: gross.minus(discount).toNumber() };
  });
  const subtotalDecimal = source.reduce((sum, item) => sum.plus(lineGross(item.quantity, item.unitPrice)), new Decimal(0));
  const netDecimal = items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0));
  const subtotal = subtotalDecimal.toNumber(), discountTotal = subtotalDecimal.minus(netDecimal).toNumber();
  const taxAmountDecimal = rounded(netDecimal.mul(taxRate).div(100));
  return { items, subtotal, discountTotal, taxAmount: taxAmountDecimal.toNumber(), total: netDecimal.plus(taxAmountDecimal).toNumber() };
}
