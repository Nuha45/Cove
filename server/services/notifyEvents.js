const User = require('../models/User');
const Business = require('../models/Business');
const Order = require('../models/Order');
const EmailDelivery = require('../models/EmailDelivery');
const { hashConfirmationToken, openConfirmationToken } = require('../utils/confirmationToken');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const env = require('../config/env');

function appBase() {
  return env.appUrl.replace(/\/$/, '');
}

function sellerOrderUrl(orderId) {
  return `${appBase()}/orders/${orderId}`;
}

function sellerWantsUrl() {
  return `${appBase()}/customer-wants`;
}

// Claims the dedupe key first so retries and duplicate events never send twice.
// Returns false without sending when the key was already used.
async function sendOnce({ businessId, dedupeKey, kind }, send) {
  let claim;
  try {
    claim = await EmailDelivery.create({ businessId, dedupeKey, kind, status: 'sending' });
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
  let result;
  try {
    result = await send();
  } catch (err) {
    result = { ok: false, error: err.message || 'email_failed' };
  }
  if (!result?.ok) {
    // Release the key so a retried job can try again; the failure is already logged by emailService.
    await EmailDelivery.deleteOne({ _id: claim._id }).catch(() => {});
    return false;
  }
  claim.status = result.skipped ? 'skipped' : 'sent';
  await claim.save().catch(() => {});
  return true;
}

function lowStockThreshold(business) {
  const value = Number(business?.lowStockThreshold);
  return Number.isFinite(value) && value >= 0 ? value : 5;
}

async function getBusinessOwner(businessId) {
  return User.findOne({ businessId, role: 'owner' });
}

async function getBusiness(businessId) {
  return Business.findById(businessId);
}

function prefs(business) {
  return {
    emailNewOrders: business?.emailNewOrders !== false,
    emailPayments: business?.emailPayments !== false,
    emailCustomerWants: business?.emailCustomerWants !== false,
    emailLowStock: business?.emailLowStock !== false,
    emailWeeklyReport: business?.emailWeeklyReport !== false,
    emailOrderConfirmation: business?.emailOrderConfirmation !== false,
    emailOrderUpdates: business?.emailOrderUpdates !== false,
  };
}

// Fire-and-forget style: callers should not await unless they need it for tests.
async function notifyNewOrder({ businessId, order }) {
  try {
    const [owner, business] = await Promise.all([
      getBusinessOwner(businessId),
      getBusiness(businessId),
    ]);
    if (!owner || !business) return;

    const publicOrder = typeof order.toPublic === 'function' ? order.toPublic() : order;
    await notificationService.createOnce({
      userId: owner._id,
      businessId,
      type: 'NEW_ORDER',
      title: 'New order received',
      message: `${publicOrder.orderNumber} · ${publicOrder.customer?.name || 'Customer'} · ${emailService.formatMoney(publicOrder.total, business.currency || 'INR')}`,
      relatedEntityType: 'order',
      relatedEntityId: publicOrder.id || order._id,
      dedupeKey: `NEW_ORDER:${publicOrder.id || order._id}`,
    });

    if (prefs(business).emailNewOrders) {
      await emailService.sendSellerNewOrder({
        to: owner.email,
        businessName: business.name,
        order: publicOrder,
        orderUrl: sellerOrderUrl(publicOrder.id || order._id),
        currency: business.currency || 'INR',
      });
    }
  } catch (err) {
    console.error('[notify:new_order]', err.message || err);
  }
}

async function notifyPaymentSubmitted({ businessId, order }) {
  try {
    const [owner, business] = await Promise.all([
      getBusinessOwner(businessId),
      getBusiness(businessId),
    ]);
    if (!owner || !business) return;

    const publicOrder = typeof order.toPublic === 'function' ? order.toPublic() : order;
    const orderId = publicOrder.id || order._id;
    await notificationService.createOnce({
      userId: owner._id,
      businessId,
      type: 'PAYMENT_SUBMITTED',
      title: 'Payment submitted',
      message: `${publicOrder.orderNumber} · reference waiting for your review`,
      relatedEntityType: 'order',
      relatedEntityId: orderId,
      dedupeKey: `PAYMENT_SUBMITTED:${orderId}:${publicOrder.paymentReference || 'none'}`,
    });

    if (prefs(business).emailPayments) {
      await emailService.sendSellerPaymentSubmitted({
        to: owner.email,
        businessName: business.name,
        order: publicOrder,
        orderUrl: sellerOrderUrl(orderId),
      });
    }
  } catch (err) {
    console.error('[notify:payment_submitted]', err.message || err);
  }
}

// Same guest link the checkout returned; empty for seller-created or older orders.
async function buyerTrackingUrl(business, publicOrder, confirmationToken) {
  let token = confirmationToken;
  if (!token) {
    const row = await Order.findOne({ _id: publicOrder.id, businessId: business._id })
      .select('+confirmationTokenHash +confirmationTokenSealed')
      .lean();
    if (!row?.confirmationTokenHash || !row.confirmationTokenSealed) return '';
    const opened = openConfirmationToken(row.confirmationTokenSealed);
    if (!opened || hashConfirmationToken(opened) !== row.confirmationTokenHash) return '';
    token = opened;
  }
  return `${appBase()}/store/${business.slug}/order/${encodeURIComponent(publicOrder.orderNumber)}?c=${encodeURIComponent(token)}`;
}

const BUYER_PAYMENT_EMAILS = {
  Paid: { kind: 'buyer_payment_paid', send: (args) => emailService.sendCustomerPaymentVerified(args) },
  'Payment Rejected': { kind: 'buyer_payment_rejected', send: (args) => emailService.sendCustomerPaymentRejected(args) },
};

const BUYER_STATUS_EMAILS = ['Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];

// Payment can move Paid → Pending → Paid, so the key includes the payment event count:
// each real transition gets its own key, while replays of the same transition reuse it.
async function notifyPaymentChanged({ businessId, order, previousPayment }) {
  try {
    const publicOrder = typeof order.toPublic === 'function' ? order.toPublic() : order;
    if (!previousPayment || previousPayment === publicOrder.paymentStatus) return;
    const config = BUYER_PAYMENT_EMAILS[publicOrder.paymentStatus];
    if (!config) return;
    const email = publicOrder.customer?.email;
    if (!email) return;
    const business = await getBusiness(businessId);
    if (!business) return;

    const eventCount = (publicOrder.paymentEvents || []).length;
    const trackingUrl = await buyerTrackingUrl(business, publicOrder);
    await sendOnce(
      {
        businessId,
        dedupeKey: `BUYER_PAYMENT:${publicOrder.id}:${eventCount}:${publicOrder.paymentStatus}`,
        kind: config.kind,
      },
      () => config.send({
        to: email,
        businessName: business.name,
        order: publicOrder,
        currency: business.currency || 'INR',
        trackingUrl,
      })
    );
  } catch (err) {
    console.error('[notify:payment_changed]', err.message || err);
  }
}

// Order statuses only move forward, so one email per order and status is enough.
async function notifyOrderStatusChanged({ businessId, order, previousStatus }) {
  try {
    const publicOrder = typeof order.toPublic === 'function' ? order.toPublic() : order;
    if (!previousStatus || previousStatus === publicOrder.status) return;
    if (!BUYER_STATUS_EMAILS.includes(publicOrder.status)) return;
    const email = publicOrder.customer?.email;
    if (!email) return;
    const business = await getBusiness(businessId);
    if (!business || !prefs(business).emailOrderUpdates) return;

    const trackingUrl = await buyerTrackingUrl(business, publicOrder);
    await sendOnce(
      {
        businessId,
        dedupeKey: `BUYER_STATUS:${publicOrder.id}:${publicOrder.status}`,
        kind: 'buyer_order_status',
      },
      () => emailService.sendCustomerOrderStatus({
        to: email,
        businessName: business.name,
        order: publicOrder,
        trackingUrl,
      })
    );
  } catch (err) {
    console.error('[notify:order_status]', err.message || err);
  }
}

async function notifyCustomerWant({ businessId, wantId, preview }) {
  try {
    const [owner, business] = await Promise.all([
      getBusinessOwner(businessId),
      getBusiness(businessId),
    ]);
    if (!owner || !business) return;

    await notificationService.createOnce({
      userId: owner._id,
      businessId,
      type: 'CUSTOMER_WANT',
      title: 'New customer request',
      message: String(preview || 'A customer asked for something new.').slice(0, 400),
      relatedEntityType: 'customerWant',
      relatedEntityId: wantId,
      dedupeKey: `CUSTOMER_WANT:${wantId}`,
    });

    if (prefs(business).emailCustomerWants) {
      await emailService.sendSellerCustomerWant({
        to: owner.email,
        businessName: business.name,
        wantPreview: String(preview || '').slice(0, 200),
        wantsUrl: sellerWantsUrl(),
      });
    }
  } catch (err) {
    console.error('[notify:customer_want]', err.message || err);
  }
}

// Fires only when an order moves a product from above the threshold to at/below it,
// so restocks followed by new sales alert again but repeated sales at low stock do not.
async function notifyLowStock({ businessId, orderId, changes }) {
  try {
    if (!Array.isArray(changes) || !changes.length) return;
    const business = await getBusiness(businessId);
    if (!business) return;
    const threshold = lowStockThreshold(business);
    const crossed = changes.filter((change) => change.before > threshold && change.after <= threshold);
    if (!crossed.length) return;

    const owner = await getBusinessOwner(businessId);
    if (!owner) return;

    await Promise.all(crossed.map((change) => notificationService.createOnce({
      userId: owner._id,
      businessId,
      type: 'LOW_STOCK',
      title: change.after === 0 ? 'Out of stock' : 'Low stock',
      message: change.after === 0
        ? `${change.name} is out of stock.`
        : `${change.name} has ${change.after} left.`,
      relatedEntityType: 'product',
      relatedEntityId: change.productId,
      dedupeKey: `LOW_STOCK:${change.productId}:${orderId}`,
    })));

    if (!prefs(business).emailLowStock) return;
    const billingService = require('./billingService');
    if (!(await billingService.hasAdvancedAccess(businessId))) return;

    await sendOnce(
      { businessId, dedupeKey: `LOW_STOCK:${orderId}`, kind: 'low_stock' },
      () => emailService.sendSellerLowStock({
        to: owner.email,
        businessName: business.name,
        threshold,
        products: crossed.map((change) => ({ name: change.name, stock: change.after })),
        productsUrl: `${appBase()}/products`,
      })
    );
  } catch (err) {
    console.error('[notify:low_stock]', err.message || err);
  }
}

async function notifyCustomerOrderConfirmation({ businessId, order, confirmationToken }) {
  try {
    const publicOrder = typeof order.toPublic === 'function' ? order.toPublic() : order;
    const email = publicOrder.customer?.email;
    if (!email) return;
    const business = await getBusiness(businessId);
    if (!business || !prefs(business).emailOrderConfirmation) return;

    const confirmationUrl = await buyerTrackingUrl(business, publicOrder, confirmationToken);
    const billingService = require('./billingService');
    const invoiceUrl = confirmationToken && (await billingService.hasAdvancedAccess(businessId))
      ? `${appBase()}/api/store/${business.slug}/orders/confirm/${encodeURIComponent(confirmationToken)}/invoice`
      : '';

    await sendOnce(
      { businessId, dedupeKey: `ORDER_CONFIRMATION:${publicOrder.id}`, kind: 'order_confirmation' },
      () => emailService.sendCustomerOrderConfirmation({
        to: email,
        businessName: business.name,
        order: publicOrder,
        currency: business.currency || 'INR',
        confirmationUrl,
        invoiceUrl,
      })
    );
  } catch (err) {
    console.error('[notify:order_confirmation]', err.message || err);
  }
}

module.exports = {
  notifyNewOrder,
  notifyPaymentSubmitted,
  notifyPaymentChanged,
  notifyOrderStatusChanged,
  notifyCustomerWant,
  notifyLowStock,
  notifyCustomerOrderConfirmation,
  sendOnce,
  prefs,
};
