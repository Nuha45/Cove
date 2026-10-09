const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { renderInvoicePdf, formatMoney } = require('../utils/invoicePdf');
const { pdfText, pdfPageCount, pdfFonts, pdfMissingGlyphs } = require('./_pdfText');

function snapshot(overrides = {}) {
  return {
    invoiceNumber: 'INV-0007',
    orderNumber: 'COV-1007',
    issuedAt: new Date('2026-10-02T09:00:00Z'),
    orderDate: new Date('2026-10-01T09:00:00Z'),
    currency: 'INR',
    seller: { name: 'Asha Bakes', email: 'shop@example.com', phone: '9000000001', city: 'Pune' },
    customer: { name: 'Ravi Kumar', email: 'ravi@example.com', phone: '9000000002' },
    deliveryMethod: 'Delivery',
    deliveryAddress: '12 Baker Street, Koregaon Park',
    items: [
      { name: 'Chocolate cake', price: 450, quantity: 1, subtotal: 450 },
      { name: 'Butter cookies', price: 120, quantity: 3, subtotal: 360 },
    ],
    subtotal: 810,
    deliveryFee: 40,
    total: 850,
    ...overrides,
  };
}

async function render(invoice, details) {
  const pdf = await renderInvoicePdf(invoice, details);
  const lines = pdfText(pdf).split('\n');
  // Joined with spaces so sentences that wrap onto two lines still match.
  return { pdf, lines: lines.map((line) => line.trim()), text: lines.join(' ').replace(/\s+/g, ' ') };
}

describe('invoice PDF', () => {
  it('shows the invoice details, both parties, every item and the stored totals', async () => {
    const { pdf, text } = await render(snapshot(), {
      paymentStatus: 'Payment Pending',
      paymentMethod: 'Cash on delivery',
      orderStatus: 'New',
      deliveryEstimate: 'Within 2 days',
    });

    assert.ok(pdf.subarray(0, 5).toString() === '%PDF-');
    assert.equal(pdfPageCount(pdf), 1);
    for (const expected of [
      'Invoice number', 'INV-0007', 'Invoice date', '2 Oct 2026', 'Order number', 'COV-1007', 'Order date', '1 Oct 2026',
      'FROM', 'Asha Bakes', 'Pune', '9000000001', 'shop@example.com',
      'BILL TO', 'Ravi Kumar', '9000000002', 'ravi@example.com', '12 Baker Street, Koregaon Park', 'Within 2 days',
      'Chocolate cake', 'Butter cookies',
      'Subtotal', formatMoney(810, 'INR'), 'Delivery fee', formatMoney(40, 'INR'), 'Total', formatMoney(850, 'INR'),
      'Cash on delivery', 'New',
    ]) {
      assert.ok(text.includes(expected), `missing "${expected}"`);
    }
  });

  it('keeps an unpaid order pending and never says it was paid', async () => {
    const { lines, text } = await render(snapshot(), { paymentStatus: 'Payment Pending', orderStatus: 'New' });
    assert.ok(lines.includes('Payment Pending'));
    assert.ok(text.includes('The seller has not confirmed payment for this order yet.'));
    assert.ok(!lines.includes('Paid'));
    assert.ok(!text.includes('The seller confirmed payment'));
  });

  it('shows a legacy Pending status as Payment Pending', async () => {
    const { lines } = await render(snapshot(), { paymentStatus: 'Pending' });
    assert.ok(lines.includes('Payment Pending'));
  });

  it('describes submitted, rejected and paid payments as recorded', async () => {
    const submitted = await render(snapshot(), { paymentStatus: 'Payment Submitted' });
    assert.ok(submitted.lines.includes('Payment Submitted'));
    assert.ok(submitted.text.includes('The seller has not confirmed the payment yet.'));

    const rejected = await render(snapshot(), { paymentStatus: 'Payment Rejected' });
    assert.ok(rejected.lines.includes('Payment Rejected'));

    const paid = await render(snapshot(), { paymentStatus: 'Paid', paymentMethod: 'UPI QR code' });
    assert.ok(paid.lines.includes('Paid'));
    assert.ok(paid.text.includes('The seller confirmed payment for this order.'));
  });

  it('omits the delivery fee and address for pickup orders', async () => {
    const { text } = await render(
      snapshot({ deliveryMethod: 'Pickup', deliveryAddress: '', deliveryFee: 0, total: 810 }),
      { paymentStatus: 'Payment Pending', paymentMethod: 'Pay on pickup', deliveryEstimate: 'ignored' },
    );
    assert.ok(text.includes('Pickup from the seller'));
    assert.ok(!text.includes('Delivery fee'));
    assert.ok(!text.includes('Delivery address'));
    assert.ok(text.includes(formatMoney(810, 'INR')));
  });

  it('never invents discount or tax lines', async () => {
    const { lines } = await render(snapshot(), { paymentStatus: 'Paid' });
    assert.ok(!lines.some((line) => /^(discount|tax|gst|cgst|sgst|igst|gstin)\b/i.test(line)));
    assert.ok(lines.includes('No tax has been itemised on this invoice.'));
  });

  it('marks a cancelled order without changing its payment status', async () => {
    const { lines, text } = await render(snapshot(), { paymentStatus: 'Payment Pending', orderStatus: 'Cancelled' });
    assert.ok(lines.includes('Cancelled'));
    assert.ok(lines.includes('Payment Pending'));
    assert.ok(text.includes('This order was cancelled.'));
  });

  it('handles missing payment details without guessing', async () => {
    const { lines } = await render(snapshot({ seller: { name: 'Asha Bakes' }, customer: { name: 'Ravi Kumar' } }), {});
    assert.ok(lines.includes('Not selected'));
    assert.ok(lines.includes('Not recorded'));
  });

  it('spreads many long items over several pages with a header and footer on each', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      name: `Item ${i + 1} handmade stoneware serving bowl with a long hand-painted glaze description that wraps onto more lines`,
      price: 100,
      quantity: 1,
      subtotal: 100,
    }));
    const { pdf, text, lines } = await render(
      snapshot({ items, subtotal: 4000, deliveryFee: 0, total: 4000, deliveryMethod: 'Pickup' }),
      { paymentStatus: 'Paid', orderStatus: 'Completed' },
    );

    const pages = pdfPageCount(pdf);
    assert.ok(pages > 1, `expected several pages, got ${pages}`);
    for (let i = 1; i <= 40; i += 1) assert.ok(text.includes(`Item ${i} handmade`), `missing item ${i}`);
    for (let page = 1; page <= pages; page += 1) {
      assert.ok(text.includes(`Page ${page} of ${pages}`), `missing footer for page ${page}`);
    }
    assert.equal(lines.filter((line) => line === 'UNIT PRICE').length, pages);
    assert.ok(text.includes(formatMoney(4000, 'INR')));
  });
});

describe('invoice PDF fonts', () => {
  it('prints rupee amounts with the ₹ sign and Indian digit grouping', async () => {
    assert.equal(formatMoney(1234.5, 'INR'), '₹1,234.50');
    assert.equal(formatMoney(12345678, 'INR'), '₹1,23,45,678.00');
    assert.equal(formatMoney(-5, 'INR'), '-₹5.00');
    assert.equal(formatMoney(1234.5, 'USD'), '$1,234.50');
    assert.equal(formatMoney(1234.5, 'AED'), 'AED 1,234.50');

    const { pdf, lines, text } = await render(snapshot(), { paymentStatus: 'Paid' });
    for (const amount of ['₹450.00', '₹120.00', '₹360.00', '₹810.00', '₹40.00', '₹850.00']) {
      assert.ok(lines.includes(amount), `missing ${amount}`);
    }
    assert.ok(!text.includes('Rs.'));
    assert.equal(pdfMissingGlyphs(pdf), 0);
  });

  it('embeds the bundled Noto Sans for amounts rather than relying on installed fonts', async () => {
    const { pdf } = await render(snapshot(), { paymentStatus: 'Paid' });
    const fonts = pdfFonts(pdf);
    assert.ok(fonts.includes('NotoSans-Regular'));
    assert.ok(fonts.includes('NotoSans-Bold'));
    assert.equal((pdf.toString('latin1').match(/\/FontFile2 /g) || []).length, 2);
  });
});