import type { OrderForPayment } from './types';
import { allocateProportionally, includedVatOre, normalizeVatPercent } from '../tax';

const CURRENCY = 'SEK';

export type MolliePaymentLine = {
  type?: 'physical' | 'shipping_fee' | 'discount' | 'surcharge';
  description: string;
  quantity: number;
  unitPrice: { currency: string; value: string };
  discountAmount?: { currency: string; value: string };
  totalAmount: { currency: string; value: string };
  vatRate?: string;
  vatAmount?: { currency: string; value: string };
};

const money = (ore: number) => ({ currency: CURRENCY, value: (ore / 100).toFixed(2) });

const withVat = (grossOre: number, vatPercent: number) => {
  const rate = normalizeVatPercent(vatPercent);
  return {
    vatRate: rate.toFixed(2),
    vatAmount: money(includedVatOre(grossOre, rate)),
  };
};

/** Proportionally distribute an order-level food discount without losing ören. */
export const allocateDiscount = allocateProportionally;

/**
 * Build line items that exactly reconcile to the authoritative order total.
 * Discounts stay on the taxable supply they reduce, so mixed VAT remains valid.
 */
export function buildMollieLines(order: OrderForPayment): MolliePaymentLine[] {
  const itemGross = order.items.map((item) => Math.max(0, Math.trunc(item.subtotal)));
  const foodGross = itemGross.reduce((sum, value) => sum + value, 0);
  const foodDiscount = Math.max(0, Math.trunc(order.foodDiscountAmount));
  const deliveryDiscount = Math.max(0, Math.trunc(order.deliveryDiscountAmount));

  if (foodDiscount > foodGross) throw new Error('Matrabatten överstiger matvärdet');
  if (deliveryDiscount > order.deliveryFee) throw new Error('Leveransrabatten överstiger leveransavgiften');
  if (foodDiscount + deliveryDiscount !== order.discountAmount) {
    throw new Error('Orderns rabattkomponenter matchar inte totalrabatten');
  }

  const itemDiscounts = allocateDiscount(foodDiscount, itemGross);
  const lines: MolliePaymentLine[] = order.items.map((item, index) => {
    const gross = itemGross[index];
    const discount = itemDiscounts[index];
    const net = gross - discount;
    return {
      type: 'physical',
      description: item.quantity > 1 ? `${item.productName} ×${item.quantity}` : item.productName,
      quantity: 1,
      unitPrice: money(gross),
      ...(discount > 0 ? { discountAmount: money(discount) } : {}),
      totalAmount: money(net),
      ...withVat(net, item.vatPercent),
    };
  });

  if (order.deliveryFee > 0) {
    const netDelivery = order.deliveryFee - deliveryDiscount;
    const rate = normalizeVatPercent(order.deliveryVatPercent, order.foodVatPercent);
    lines.push({
      type: 'shipping_fee',
      description: 'Leverans',
      quantity: 1,
      unitPrice: money(order.deliveryFee),
      ...(deliveryDiscount > 0 ? { discountAmount: money(deliveryDiscount) } : {}),
      totalAmount: money(netDelivery),
      ...withVat(netDelivery, rate),
    });
  } else if (deliveryDiscount !== 0) {
    throw new Error('Leveransrabatt finns utan leveransavgift');
  }

  if (order.smallOrderFee > 0) {
    lines.push({
      type: 'surcharge',
      description: 'Komplettering till minsta ordervärde',
      quantity: 1,
      unitPrice: money(order.smallOrderFee),
      totalAmount: money(order.smallOrderFee),
      ...withVat(order.smallOrderFee, order.foodVatPercent),
    });
  }

  if (order.tipAmount > 0) {
    // Frivillig dricks förs vidare till leveranspersonen. VAT fields are
    // deliberately omitted: this line is not declared as a taxable sale.
    lines.push({
      type: 'surcharge',
      description: 'Frivillig dricks till leveransperson',
      quantity: 1,
      unitPrice: money(order.tipAmount),
      totalAmount: money(order.tipAmount),
    });
  }

  const lineTotal = lines.reduce(
    (sum, line) => sum + Math.round(Number(line.totalAmount.value) * 100),
    0,
  );
  const diff = order.total - lineTotal;
  // Legacy orders may have been rounded up to whole SEK. Preserve those only;
  // every newly created order has diff=0 and never needs an adjustment line.
  if (diff > 0 && diff < 100) {
    lines.push({
      type: 'surcharge',
      description: 'Avrundning',
      quantity: 1,
      unitPrice: money(diff),
      totalAmount: money(diff),
      ...withVat(diff, order.foodVatPercent),
    });
  } else if (diff !== 0) {
    throw new Error(`Mollie-rader matchar inte ordertotalen (${diff} öre)`);
  }

  return lines;
}
