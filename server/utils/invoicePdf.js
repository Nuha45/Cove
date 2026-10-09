const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { currencyCode, currencySymbol, formatMoney: formatCurrency } = require('./currencies');

// Cove website palette (client/src/index.css :root), so invoices match the app.
const COLORS = {
  ink: '#1F2937',
  body: '#374151',
  muted: '#6B7280',
  line: '#F3D7C8',
  rule: '#F1E6DD',
  accent: '#FF7A3D',
  soft: '#FFF4EB',
  card: '#FFFCFA',
  total: '#FFE4D4',
};

// Same tones as the dashboard badges (.badge.* in index.css) and utils/orders.js.
const TONES = {
  green: { bg: '#A7C4B3', fg: '#3F6F5B' },
  yellow: { bg: '#FFF5D9', fg: '#A77516' },
  orange: { bg: '#FFF0E5', fg: '#B2572D' },
  blue: { bg: '#EAF0FA', fg: '#476B9B' },
  red: { bg: '#F9E9E7', fg: '#B6504A' },
  neutral: { bg: '#F4F1EC', fg: '#6B7280' },
};

const PAYMENT_TONE = {
  'Payment Pending': 'yellow',
  'Payment Submitted': 'blue',
  Paid: 'green',
  'Payment Rejected': 'red',
};

const STATUS_TONE = {
  New: 'orange',
  Confirmed: 'blue',
  Preparing: 'yellow',
  Ready: 'green',
  Completed: 'green',
  Cancelled: 'red',
};

const PAYMENT_NOTES = {
  'Payment Pending': 'The seller has not confirmed payment for this order yet.',
  'Payment Submitted': 'The customer shared payment details. The seller has not confirmed the payment yet.',
  Paid: 'The seller confirmed payment for this order.',
  'Payment Rejected': 'The seller could not confirm a payment for this order.',
};

const MARGIN_X = 44;
const MARGIN_TOP = 40;
const FOOTER_SPACE = 60;
const TOTALS_RESERVE = 110;

let markImage = null;
try {
  markImage = fs.readFileSync(path.join(__dirname, '..', 'assets', 'cove-mark.png'));
} catch {
  markImage = null;
}

// Helvetica, the built-in PDF font, has no rupee sign, so amounts are drawn in bundled Noto Sans
// (SIL Open Font License, see assets/fonts/OFL-NotoSans.txt), embedded as a subset in every PDF.
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const MONEY_FONTS = {
  'money-regular': 'NotoSans-Regular.ttf',
  'money-bold': 'NotoSans-Bold.ttf',
};
// Helvetica text drawn at y has its baseline one cap height lower; amounts use the same baseline
// so they line up with their labels even though Noto Sans has a taller ascender.
const HELVETICA_CAP_HEIGHT = 0.718;

let moneyFontData = null;
function loadMoneyFonts() {
  if (!moneyFontData) {
    moneyFontData = Object.entries(MONEY_FONTS).map(([name, file]) => [name, fs.readFileSync(path.join(FONT_DIR, file))]);
  }
  return moneyFontData;
}

// Noto Sans has $, £, € and ₹ but no Arabic script, so AED prints as its code.
const PDF_PREFIX = { AED: 'AED ' };

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

// Shortens one-line text so it never runs into the next column.
function fit(doc, text, width) {
  const value = String(text || '');
  if (doc.widthOfString(value) <= width) return value;
  let end = value.length;
  while (end > 1 && doc.widthOfString(`${value.slice(0, end)}...`) > width) end -= 1;
  return `${value.slice(0, end).trimEnd()}...`;
}

// Draws a one-line amount in the current fill colour.
function drawMoney(doc, text, x, y, { bold = false, size, ...options }) {
  doc.font(bold ? 'money-bold' : 'money-regular').fontSize(size)
    .text(text, x, y, { ...options, baseline: -HELVETICA_CAP_HEIGHT * size, lineBreak: false });
}

function eyebrow(doc, text, x, y, width) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.muted)
    .text(text.toUpperCase(), x, y, { width, characterSpacing: 0.8, lineBreak: false });
}

function pill(doc, text, x, y, toneKey) {
  const tone = TONES[toneKey] || TONES.neutral;
  doc.font('Helvetica-Bold').fontSize(8.5);
  const width = doc.widthOfString(text) + 14;
  doc.roundedRect(x, y, width, 17, 5).fill(tone.bg);
  doc.fillColor(tone.fg).text(text, x + 7, y + 5, { lineBreak: false });
}

function layoutFor(doc) {
  const left = MARGIN_X;
  const right = doc.page.width - MARGIN_X;
  return { left, right, width: right - left, bottom: doc.page.height - FOOTER_SPACE };
}

function ensureSpace(doc, layout, y, needed) {
  if (y + needed <= layout.bottom) return y;
  doc.addPage();
  return MARGIN_TOP;
}

function drawHeader(doc, layout, invoice) {
  const top = MARGIN_TOP - 2;
  if (markImage) doc.image(markImage, layout.left, top, { width: 26, height: 26 });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.ink)
    .text('Cove', markImage ? layout.left + 33 : layout.left, top + 5, { lineBreak: false, characterSpacing: -0.4 });
  doc.font('Helvetica-Bold').fontSize(26).fillColor(COLORS.ink)
    .text('Invoice', layout.left, top + 48, { lineBreak: false });

  const metaWidth = 236;
  const metaX = layout.right - metaWidth;
  const rows = [
    ['Invoice number', invoice.invoiceNumber],
    ['Invoice date', formatDate(invoice.issuedAt)],
    ['Order number', invoice.orderNumber],
    ['Order date', formatDate(invoice.orderDate)],
  ];
  let y = top + 2;
  rows.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(label, metaX, y, { width: 96, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink);
    doc.text(fit(doc, value, metaWidth - 100), metaX + 100, y - 0.5, { width: metaWidth - 100, align: 'right', lineBreak: false });
    y += 18;
  });

  const bottom = Math.max(top + 84, y) + 14;
  doc.moveTo(layout.left, bottom).lineTo(layout.right, bottom).lineWidth(0.75).strokeColor(COLORS.line).stroke();
  return bottom + 18;
}

function drawSummary(doc, layout, y, cells) {
  const height = 52;
  doc.roundedRect(layout.left, y, layout.width, height, 8).lineWidth(0.75).fillAndStroke(COLORS.card, COLORS.line);
  const cellWidth = layout.width / cells.length;
  cells.forEach((cell, index) => {
    const x = layout.left + cellWidth * index + 14;
    const inner = cellWidth - 24;
    eyebrow(doc, cell.label, x, y + 12, inner);
    if (cell.tone) {
      pill(doc, cell.value, x, y + 25, cell.tone);
    } else {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink);
      doc.text(fit(doc, cell.value, inner), x, y + 28, { width: inner, lineBreak: false });
    }
  });
  return y + height + 22;
}

function drawParty(doc, x, y, width, { label, name, lines, extras }) {
  eyebrow(doc, label, x, y, width);
  let cursor = y + 15;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.ink);
  doc.text(name || '-', x, cursor, { width });
  cursor = doc.y + 3;
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.body);
  lines.filter(Boolean).forEach((line) => {
    doc.text(line, x, cursor, { width });
    cursor = doc.y + 2;
  });
  extras.filter((item) => item.text).forEach((item) => {
    cursor += 6;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.muted).text(item.label, x, cursor, { width });
    cursor = doc.y + 2;
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.body).text(item.text, x, cursor, { width });
    cursor = doc.y + 2;
  });
  return cursor;
}

function tableColumns(layout) {
  const pad = 12;
  const amountWidth = 96;
  const priceWidth = 92;
  const qtyWidth = 44;
  const amountX = layout.right - pad - amountWidth;
  const priceX = amountX - 12 - priceWidth;
  const qtyX = priceX - 12 - qtyWidth;
  const itemX = layout.left + pad;
  return { itemX, itemWidth: qtyX - 18 - itemX, qtyX, qtyWidth, priceX, priceWidth, amountX, amountWidth };
}

function drawTableHeader(doc, layout, cols, y) {
  doc.roundedRect(layout.left, y, layout.width, 26, 6).fill(COLORS.soft);
  const labelY = y + 9.5;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.muted);
  doc.text('ITEM', cols.itemX, labelY, { characterSpacing: 0.8, lineBreak: false });
  doc.text('QTY', cols.qtyX, labelY, { width: cols.qtyWidth, align: 'right', characterSpacing: 0.8, lineBreak: false });
  doc.text('UNIT PRICE', cols.priceX, labelY, { width: cols.priceWidth, align: 'right', characterSpacing: 0.8, lineBreak: false });
  doc.text('AMOUNT', cols.amountX, labelY, { width: cols.amountWidth, align: 'right', characterSpacing: 0.8, lineBreak: false });
  return y + 26;
}

function drawItems(doc, layout, y, invoice, currency) {
  const cols = tableColumns(layout);
  let cursor = drawTableHeader(doc, layout, cols, ensureSpace(doc, layout, y, 70));
  const items = invoice.items || [];
  items.forEach((item, index) => {
    doc.font('Helvetica').fontSize(10);
    const nameHeight = doc.heightOfString(item.name, { width: cols.itemWidth });
    const rowHeight = Math.max(nameHeight, 12) + 18;
    // The last row moves with the totals so a page never holds only the totals.
    const reserve = index === items.length - 1 ? TOTALS_RESERVE : 0;
    if (cursor + rowHeight + reserve > layout.bottom) {
      doc.addPage();
      cursor = drawTableHeader(doc, layout, cols, MARGIN_TOP);
    }
    const textY = cursor + 9;
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(item.name, cols.itemX, textY, { width: cols.itemWidth });
    doc.fillColor(COLORS.body);
    doc.text(String(item.quantity), cols.qtyX, textY, { width: cols.qtyWidth, align: 'right', lineBreak: false });
    drawMoney(doc, formatMoney(item.price, currency), cols.priceX, textY, { size: 10, width: cols.priceWidth, align: 'right' });
    doc.fillColor(COLORS.ink);
    drawMoney(doc, formatMoney(item.subtotal, currency), cols.amountX, textY, {
      bold: true, size: 10, width: cols.amountWidth, align: 'right',
    });
    cursor += rowHeight;
    doc.moveTo(layout.left, cursor).lineTo(layout.right, cursor).lineWidth(0.5).strokeColor(COLORS.rule).stroke();
  });
  return cursor;
}

function drawTotals(doc, layout, y, invoice, currency, { paymentNote, showDelivery }) {
  const rows = [['Subtotal', formatMoney(invoice.subtotal, currency)]];
  if (showDelivery) rows.push(['Delivery fee', formatMoney(invoice.deliveryFee, currency)]);

  const totalsWidth = 236;
  const noteWidth = layout.width - totalsWidth - 28;
  doc.font('Helvetica').fontSize(9.5);
  const noteHeight = paymentNote ? doc.heightOfString(paymentNote, { width: noteWidth }) + 16 : 0;
  const needed = Math.max(rows.length * 20 + 44, noteHeight) + 18;
  const top = ensureSpace(doc, layout, y + 18, needed);

  if (paymentNote) {
    eyebrow(doc, 'Payment', layout.left, top + 2, noteWidth);
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.body).text(paymentNote, layout.left, top + 16, { width: noteWidth });
  }

  const x = layout.right - totalsWidth;
  let cursor = top;
  rows.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text(label, x + 12, cursor, { lineBreak: false });
    doc.fillColor(COLORS.ink);
    drawMoney(doc, value, x + 12, cursor, { size: 10, width: totalsWidth - 24, align: 'right' });
    cursor += 20;
  });
  cursor += 2;
  doc.roundedRect(x, cursor, totalsWidth, 36, 7).fill(COLORS.total);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink).text('Total', x + 12, cursor + 12.5, { lineBreak: false });
  drawMoney(doc, formatMoney(invoice.total, currency), x + 12, cursor + 11.5, {
    bold: true, size: 13, width: totalsWidth - 24, align: 'right',
  });
  return Math.max(cursor + 36, paymentNote ? top + noteHeight : 0);
}

function drawNotes(doc, layout, y, notes) {
  doc.font('Helvetica').fontSize(9.5);
  const height = doc.heightOfString(notes, { width: layout.width });
  const top = ensureSpace(doc, layout, y + 24, height + 18);
  eyebrow(doc, 'Order notes', layout.left, top, layout.width);
  doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.body).text(notes, layout.left, top + 14, { width: layout.width });
  return doc.y;
}

function drawPageChrome(doc, layout, invoice) {
  const range = doc.bufferedPageRange();
  const sellerName = invoice.seller?.name || 'the seller';
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Footer text sits inside the bottom margin; lift it so PDFKit does not start a new page.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.rect(0, 0, doc.page.width, 5).fill(COLORS.accent);
    const footerY = doc.page.height - 38;
    doc.moveTo(layout.left, footerY - 10).lineTo(layout.right, footerY - 10).lineWidth(0.75).strokeColor(COLORS.line).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    const pageLabel = `${invoice.invoiceNumber}  ·  Page ${index - range.start + 1} of ${range.count}`;
    const pageWidth = doc.widthOfString(pageLabel) + 4;
    doc.text(pageLabel, layout.right - pageWidth, footerY, { width: pageWidth, align: 'right', lineBreak: false });
    const leftWidth = layout.width - pageWidth - 16;
    doc.text(fit(doc, `Issued by ${sellerName} through Cove · mycove.online`, leftWidth), layout.left, footerY, {
      width: leftWidth,
      lineBreak: false,
    });
    doc.text('No tax has been itemised on this invoice.', layout.left, footerY + 11, { width: leftWidth, lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}

/**
 * Renders a stored invoice snapshot. Amounts always come from the snapshot (a copy of the order);
 * payment and order status are passed in from the live order and are only displayed, never changed.
 */
function renderInvoicePdf(invoice, details = {}) {
  const paymentStatus = details.paymentStatus === 'Pending' ? 'Payment Pending' : (details.paymentStatus || '');
  const paymentMethod = details.paymentMethod || '';
  const orderStatus = details.orderStatus || '';
  const notes = String(details.notes || '').trim();
  const deliveryEstimate = String(details.deliveryEstimate || '').trim();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: MARGIN_TOP, bottom: FOOTER_SPACE, left: MARGIN_X, right: MARGIN_X },
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

    try {
      loadMoneyFonts().forEach(([name, data]) => doc.registerFont(name, data));
      const currency = invoice.currency || 'INR';
      const layout = layoutFor(doc);
      const isDelivery = invoice.deliveryMethod === 'Delivery';
      const cancelled = orderStatus === 'Cancelled';

      let y = drawHeader(doc, layout, invoice);
      y = drawSummary(doc, layout, y, [
        { label: 'Payment status', value: paymentStatus || 'Not recorded', tone: PAYMENT_TONE[paymentStatus] || 'neutral' },
        { label: 'Payment method', value: paymentMethod || 'Not selected' },
        { label: 'Order status', value: orderStatus || 'Not recorded', tone: STATUS_TONE[orderStatus] || 'neutral' },
        { label: 'Fulfilment', value: invoice.deliveryMethod || 'Not recorded' },
      ]);

      const columnWidth = (layout.width - 28) / 2;
      const sellerBottom = drawParty(doc, layout.left, y, columnWidth, {
        label: 'From',
        name: invoice.seller?.name,
        lines: [invoice.seller?.city, invoice.seller?.phone, invoice.seller?.email],
        extras: [],
      });
      const customerBottom = drawParty(doc, layout.left + columnWidth + 28, y, columnWidth, {
        label: 'Bill to',
        name: invoice.customer?.name,
        lines: [invoice.customer?.phone, invoice.customer?.email],
        extras: isDelivery
          ? [
            { label: 'Delivery address', text: invoice.deliveryAddress },
            { label: 'Estimated delivery', text: deliveryEstimate },
          ]
          : [{ label: 'Fulfilment', text: invoice.deliveryMethod === 'Pickup' ? 'Pickup from the seller' : '' }],
      });
      y = Math.max(sellerBottom, customerBottom) + 22;

      y = drawItems(doc, layout, y, invoice, currency);
      const paymentNote = cancelled
        ? `This order was cancelled. ${PAYMENT_NOTES[paymentStatus] || ''}`.trim()
        : PAYMENT_NOTES[paymentStatus] || '';
      y = drawTotals(doc, layout, y, invoice, currency, {
        paymentNote,
        showDelivery: isDelivery || Number(invoice.deliveryFee) > 0,
      });
      if (notes) drawNotes(doc, layout, y, notes);

      drawPageChrome(doc, layout, invoice);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { renderInvoicePdf, formatMoney };
