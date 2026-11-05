import { CommercialEngine } from '../../services/commercial/commercialEngine';
import { CouponEngine } from '../../services/commercial/couponEngine';
import { createSaleSchema } from '../../schemas/sale.schema';
import { Money } from '../../lib/money';

jest.mock('../../local-db', () => ({
  localDb: {
    prepare: () => ({ get: (id: string) => ({ id, name: id, gst_rate: Number(id), sale_unit: 'STRIP' }) }),
  },
}));
jest.mock('../../services/commercial/priceBookService', () => ({
  PriceBookService: {
    resolveHierarchy: () => ({ basePricePaise: 11200, mrpPaise: 11200, source: 'MASTER_CATALOG', priority: 0 }),
  },
}));
jest.mock('../../services/commercial/marginGuard', () => ({
  MarginGuard: { evaluate: () => ({ costPaise: 5000, status: 'ALLOWED', requiresSupervisorApproval: false }) },
}));
jest.mock('../../services/commercial/promotionEngine', () => ({
  PromotionEngine: {
    evaluateCartPromotions: () => ({ totalPromoDiscountPaise: 0, lineDiscounts: new Map(), appliedPromotions: [], rejectedPromotions: [] }),
  },
}));
jest.mock('../../services/commercial/couponEngine', () => ({
  CouponEngine: { validateCoupon: jest.fn() },
}));

const context = { organizationId: 'shop' };

test.each([undefined, false, true])('new sales force inclusive prices when the client sends %s', (price_includes_tax) => {
  const parsed = createSaleSchema.parse({
    ...(price_includes_tax === undefined ? {} : { price_includes_tax }),
    paid_amount: 112,
    items: [{ medicine_id: 'medicine', batch_id: 'batch', quantity: 1, mrp: 112, gst_rate: 12 }],
  });
  expect(parsed.price_includes_tax).toBe(true);
  const total = Money.calculateGrandTotal({
    items: parsed.items.map(i => ({ quantity: i.quantity, unitPrice: i.mrp, gstRate: i.gst_rate })),
    paidAmount: parsed.paid_amount,
    priceIncludesTax: parsed.price_includes_tax,
  });
  expect(total.grandTotal).toBe(112);
  expect(total.balanceDue).toBe(0);
  expect(total.totalGst).toBe(12);
});

test.each([0, 5, 12, 18, 28])('POS keeps the selling price unchanged at %s%% GST', rate => {
  const quote = CommercialEngine.quoteCommercialCart({ ...context, items: [{ medicine_id: String(rate), quantity: 1 }] });
  expect(quote.grandTotalPaise).toBe(11200);
  expect(quote.lines[0].lineTotalPaise).toBe(11200);
  expect(quote.taxableAmountPaise + quote.totalGstPaise).toBe(11200);
  expect(quote.cgstPaise + quote.sgstPaise).toBe(quote.totalGstPaise);
});

test('discounts reduce both the included GST and customer payment', () => {
  const quote = CommercialEngine.quoteCommercialCart({
    ...context,
    items: [{ medicine_id: '12', quantity: 2, requested_discount_pct: 10 }],
    billDiscountPaise: 1120,
  });
  // ₹224 less ₹22.40 line discount and ₹11.20 bill discount = ₹190.40.
  expect(quote.subtotalPaise - quote.totalDiscountPaise).toBe(19040);
  expect(quote.lines[0].lineTotalPaise).toBe(19040);
  expect(quote.totalGstPaise).toBe(2040);
  expect(quote.taxableAmountPaise).toBe(17000);
  expect(quote.grandTotalPaise - quote.roundOffPaise).toBe(19040);
});

test('mixed rates and coupon allocation reconcile to the last paise', () => {
  jest.mocked(CouponEngine.validateCoupon).mockReturnValue({
    isValid: true, statusCode: 'VALID', message: 'Valid', discountAmountPaise: 1501,
  });
  const quote = CommercialEngine.quoteCommercialCart({
    ...context,
    items: [{ medicine_id: '5', quantity: 1 }, { medicine_id: '18', quantity: 1 }, { medicine_id: '0', quantity: 1 }],
    couponCode: 'SAVE',
    billDiscountPaise: 100,
  });
  const gross = quote.subtotalPaise - quote.totalDiscountPaise;
  expect(gross).toBe(31999);
  expect(quote.lines.reduce((sum, line) => sum + line.lineTotalPaise, 0)).toBe(gross);
  expect(quote.taxableAmountPaise + quote.totalGstPaise).toBe(gross);
  expect(quote.cgstPaise + quote.sgstPaise).toBe(quote.totalGstPaise);
  for (const line of quote.lines) {
    expect(line.taxableAmountPaise + line.taxAmountPaise).toBe(line.lineTotalPaise);
    expect(line.cgstPaise + line.sgstPaise).toBe(line.taxAmountPaise);
  }
});

test('a fully discounted bill has no payable amount or included GST', () => {
  const quote = CommercialEngine.quoteCommercialCart({ ...context, items: [{ medicine_id: '12', quantity: 1 }], billDiscountPaise: 20000 });
  expect(quote.grandTotalPaise).toBe(0);
  expect(quote.taxableAmountPaise).toBe(0);
  expect(quote.totalGstPaise).toBe(0);
  expect(quote.totalDiscountPaise).toBe(11200);
});

test('interstate GST is included entirely as IGST', () => {
  const quote = CommercialEngine.quoteCommercialCart({ ...context, items: [{ medicine_id: '12', quantity: 1 }], isInterstate: true });
  expect(quote.grandTotalPaise).toBe(11200);
  expect(quote.igstPaise).toBe(1200);
  expect(quote.cgstPaise + quote.sgstPaise).toBe(0);
});
