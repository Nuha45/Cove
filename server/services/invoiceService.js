const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const OrderCounter = require('../models/OrderCounter');
const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');
const { renderInvoicePdf } = require('../utils/invoicePdf');

const PAYMENT_METHOD_LABELS = {
  qr: 'UPI / QR',
  payment_link: 'Payment link',
  instructions: 'Payment instructions',
  pay_on_pickup: 'Pay on pickup',
  cash_on_delivery: 'Cash on delivery',
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function nextInvoiceNumber(businessId) {
  const counter = await OrderCounter.findOneAndUpdate(
    { businessId },
    { $inc: { invoiceSeq: 1 }, $setOnInsert: { seq: 0 } },
    { new: true, upsert: true }
  );
  return `INV-${String(counter.invoiceSeq).padStart(6, '0')}`;
}

function snapshotFrom(order, business) {
  return {
    businessId: order.businessId,
    orderId: order._id,
    orderNumber: order.orderNumber,
    issuedAt: new Date(),
    orderDate: order.createdAt || new Date(),
    currency: business.currency || 'INR',
    seller: {
      name: business.name || '',
      email: business.email || '',
      phone: business.phone || '',
      city: business.city || '',
    },
    customer: {
      name: order.customer?.name || '',
      email: order.customer?.email || '',
      phone: order.customer?.phone || '',
    },
    deliveryMethod: order.deliveryMethod || '',
    deliveryAddress: order.deliveryAddress || '',
    items: (order.items || []).map((item) => ({
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee || 0,
    total: order.total,
  };
}

// Idempotent: one invoice per order. Safe to call from order creation and from downloads.
async function ensureInvoiceForOrder(businessId, orderOrId) {
  const order = orderOrId instanceof Order
    ? orderOrId
    : await Order.findOne({ _id: orderOrId, businessId });
  if (!order || String(order.businessId) !== String(businessId)) {
    throw new ApiError(404, 'We could not find that order.');
  }

  const existing = await Invoice.findOne({ businessId, orderId: order._id });
  if (existing) return existing;

  const business = await Business.findById(businessId).select('name email phone city currency');
  if (!business) throw new ApiError(404, 'We could not find your business.');

  const invoiceNumber = await nextInvoiceNumber(businessId);
  try {
    return await Invoice.create({ ...snapshotFrom(order, business), invoiceNumber });
  } catch (err) {
    if (err.code === 11000) {
      const raced = await Invoice.findOne({ businessId, orderId: order._id });
      if (raced) return raced;
    }
    throw err;
  }
}

async function list(businessId, { page = 1, limit = 20, search = '' } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  let safePage = Math.max(1, Number(page) || 1);
  const filter = { businessId };
  const term = String(search || '').trim();
  if (term) {
    const pattern = new RegExp(escapeRegex(term), 'i');
    filter.$or = [
      { invoiceNumber: pattern },
      { orderNumber: pattern },
      { 'customer.name': pattern },
    ];
  }
  const total = await Invoice.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);
  if (totalPages > 0 && safePage > totalPages) safePage = totalPages;
  const invoices = await Invoice.find(filter)
    .sort({ issuedAt: -1, _id: -1 })
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit);
  return { invoices, page: safePage, limit: safeLimit, total, totalPages };
}

async function renderForInvoice(invoice) {
  const order = await Order.findOne({ _id: invoice.orderId, businessId: invoice.businessId })
    .select('paymentStatus paymentMethod status')
    .lean();
  return renderInvoicePdf(invoice, {
    paymentStatus: order?.paymentStatus === 'Pending' ? 'Payment Pending' : (order?.paymentStatus || ''),
    paymentMethod: PAYMENT_METHOD_LABELS[order?.paymentMethod] || '',
    orderStatus: order?.status || '',
  });
}

async function pdfForInvoiceId(businessId, invoiceId) {
  if (!mongoose.isValidObjectId(invoiceId)) throw new ApiError(404, 'We could not find that invoice.');
  const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new ApiError(404, 'We could not find that invoice.');
  return { invoice, pdf: await renderForInvoice(invoice) };
}

async function pdfForOrder(businessId, orderId) {
  const invoice = await ensureInvoiceForOrder(businessId, orderId);
  return { invoice, pdf: await renderForInvoice(invoice) };
}

function queueInvoiceForOrder(businessId, order) {
  setImmediate(() => {
    ensureInvoiceForOrder(businessId, order).catch((err) => {
      console.error('[invoice:create]', err.message || err);
    });
  });
}

module.exports = {
  ensureInvoiceForOrder,
  queueInvoiceForOrder,
  list,
  pdfForInvoiceId,
  pdfForOrder,
  renderForInvoice,
  PAYMENT_METHOD_LABELS,
};
