const PDFDocument = require('pdfkit');
const { currencyCode, currencySymbol, formatMoney: formatCurrency } = require('./currencies');

const COLORS = {
  ink: '#1F1A17',
  muted: '#7A6F66',
  line: '#EADFD4',
  accent: '#FF7A3D',
  soft: '#FBF7F3',
};

// Built-in PDF fonts (WinAnsi) have $, £ and € but no rupee sign or Arabic script,
// so INR prints as "Rs." and AED as its code.
const PDF_PREFIX = { INR: 'Rs. ', AED: 'AED ' };

function formatMoney(amount, currency = 'INR') {
  const code = currencyCode(currency);
  const formatted = formatCurrency(amount, code, { decimals: 2 });
  if (!PDF_PREFIX[code]) return formatted;
  return formatted.replace(currencySymbol(code), PDF_PREFIX[code]).replace(/\u200E/g, '').replace(/ {2,}/, ' ');
}

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function renderInvoicePdf(invoice, { paymentStatus = '', paymentMethod = '', orderStatus = '' } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `Invoice ${invoice.invoiceNumber}`,
        Author: invoice.seller?.name || 'Cove',
        Creator: 'Cove',
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const currency = invoice.currency || 'INR';
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Header
    doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(11).text('COVE', left, 48, { characterSpacing: 2 });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(22).text('Invoice', left, 66);
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);
    doc.text(`Invoice number: ${invoice.invoiceNumber}`, left, 48, { width, align: 'right' });
    doc.text(`Order number: ${invoice.orderNumber}`, { width, align: 'right' });
    doc.text(`Invoice date: ${formatDate(invoice.issuedAt)}`, { width, align: 'right' });
    doc.text(`Order date: ${formatDate(invoice.orderDate)}`, { width, align: 'right' });

    doc.moveTo(left, 118).lineTo(right, 118).lineWidth(1).strokeColor(COLORS.line).stroke();

    // Parties
    const colWidth = (width - 24) / 2;
    const partyTop = 134;
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(9).text('FROM', left, partyTop, { characterSpacing: 1 });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12).text(invoice.seller?.name || '', left, partyTop + 14, { width: colWidth });
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink);
    [invoice.seller?.city, invoice.seller?.phone, invoice.seller?.email]
      .filter(Boolean)
      .forEach((line) => doc.text(line, { width: colWidth }));
    const sellerBottom = doc.y;

    const billX = left + colWidth + 24;
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(9).text('BILL TO', billX, partyTop, { characterSpacing: 1 });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12).text(invoice.customer?.name || '', billX, partyTop + 14, { width: colWidth });
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink);
    [invoice.customer?.phone, invoice.customer?.email]
      .filter(Boolean)
      .forEach((line) => doc.text(line, { width: colWidth }));
    if (invoice.deliveryMethod) {
      doc.fillColor(COLORS.muted).text(
        invoice.deliveryMethod === 'Delivery' && invoice.deliveryAddress
          ? `Delivery: ${invoice.deliveryAddress}`
          : invoice.deliveryMethod,
        { width: colWidth }
      );
    }
    const partiesBottom = Math.max(sellerBottom, doc.y);

    // Items table
    let y = partiesBottom + 24;
    const cols = {
      item: left + 10,
      qty: left + width * 0.56,
      price: left + width * 0.66,
      amount: left + width * 0.82,
    };
    const colEnd = right - 10;
    doc.rect(left, y, width, 24).fill(COLORS.soft);
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(9);
    doc.text('ITEM', cols.item, y + 8);
    doc.text('QTY', cols.qty, y + 8, { width: cols.price - cols.qty - 8, align: 'right' });
    doc.text('PRICE', cols.price, y + 8, { width: cols.amount - cols.price - 8, align: 'right' });
    doc.text('AMOUNT', cols.amount, y + 8, { width: colEnd - cols.amount, align: 'right' });
    y += 30;

    doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink);
    (invoice.items || []).forEach((item) => {
      const nameHeight = doc.heightOfString(item.name, { width: cols.qty - cols.item - 12 });
      const rowHeight = Math.max(18, nameHeight + 6);
      if (y + rowHeight > doc.page.height - 160) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.fillColor(COLORS.ink).text(item.name, cols.item, y, { width: cols.qty - cols.item - 12 });
      doc.text(String(item.quantity), cols.qty, y, { width: cols.price - cols.qty - 8, align: 'right' });
      doc.text(formatMoney(item.price, currency), cols.price, y, { width: cols.amount - cols.price - 8, align: 'right' });
      doc.text(formatMoney(item.subtotal, currency), cols.amount, y, { width: colEnd - cols.amount, align: 'right' });
      y += rowHeight;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(COLORS.line).stroke();
      y += 8;
    });

    // Totals
    y += 6;
    const labelX = left + width * 0.56;
    const totalsRow = (label, value, { bold = false } = {}) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(COLORS.ink);
      doc.text(label, labelX, y, { width: cols.amount - labelX - 8 });
      doc.text(value, cols.amount - 40, y, { width: colEnd - cols.amount + 40, align: 'right' });
      y += bold ? 22 : 18;
    };
    totalsRow('Subtotal', formatMoney(invoice.subtotal, currency));
    if (Number(invoice.deliveryFee) > 0 || invoice.deliveryMethod === 'Delivery') {
      totalsRow('Delivery', formatMoney(invoice.deliveryFee, currency));
    }
    doc.moveTo(labelX, y).lineTo(right, y).lineWidth(1).strokeColor(COLORS.line).stroke();
    y += 8;
    totalsRow('Total', formatMoney(invoice.total, currency), { bold: true });

    // Status
    y += 12;
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);
    const statusLines = [
      paymentStatus ? `Payment status: ${paymentStatus}` : '',
      paymentMethod ? `Payment method: ${paymentMethod}` : '',
      orderStatus ? `Order status: ${orderStatus}` : '',
    ].filter(Boolean);
    statusLines.forEach((line) => {
      doc.text(line, left, y);
      y += 14;
    });

    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(
      'No tax has been itemised on this invoice. Generated by Cove on behalf of the seller.',
      left,
      doc.page.height - doc.page.margins.bottom - 20,
      { width, align: 'center' }
    );

    doc.end();
  });
}

module.exports = { renderInvoicePdf, formatMoney };
