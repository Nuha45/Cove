const User = require('../models/User');
const Business = require('../models/Business');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const env = require('../config/env');

function sellerOrderUrl(orderId) {
  return `${env.appUrl.replace(/\/$/, '')}/orders/${orderId}`;
}

function sellerWantsUrl() {
  return `${env.appUrl.replace(/\/$/, '')}/customer-wants`;
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
      message: `${publicOrder.orderNumber} · ${publicOrder.customer?.name || 'Customer'} · ${publicOrder.total}`,
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

async function notifyPaymentVerified({ businessId, order }) {
  try {
    const business = await getBusiness(businessId);
    if (!business) return;
    const publicOrder = typeof order.toPublic === 'function' ? order.toPublic() : order;
    const email = publicOrder.customer?.email || order.customer?.email;
    if (!email) return;

    await emailService.sendCustomerPaymentVerified({
      to: email,
      businessName: business.name,
      order: publicOrder,
    });
  } catch (err) {
    console.error('[notify:payment_verified]', err.message || err);
  }
}

async function notifyOrderStatusChanged({ businessId, order, previousStatus }) {
  try {
    if (!previousStatus || previousStatus === order.status) return;
    const business = await getBusiness(businessId);
    if (!business) return;
    const publicOrder = typeof order.toPublic === 'function' ? order.toPublic() : order;
    const email = publicOrder.customer?.email || order.customer?.email;
    if (!email) return;

    await emailService.sendCustomerOrderStatus({
      to: email,
      businessName: business.name,
      order: publicOrder,
    });
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

module.exports = {
  notifyNewOrder,
  notifyPaymentSubmitted,
  notifyPaymentVerified,
  notifyOrderStatusChanged,
  notifyCustomerWant,
};
