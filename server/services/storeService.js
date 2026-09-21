const Business = require('../models/Business');
const Product = require('../models/Product');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const orderService = require('./orderService');
const {
  createConfirmationToken,
  hashConfirmationToken,
  isConfirmationTokenShape,
} = require('../utils/confirmationToken');
const {
  canCustomerSetPayment,
  normalizePaymentMethod,
  PAYMENT_METHODS,
} = require('../utils/paymentMethods');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

const CONFIRMATION_NOT_FOUND = 'We could not find that order confirmation.';

function enabledPaymentMethods(business, deliveryMethod) {
  const payments = business.toStorefront().payments;
  const enabled = [];
  if (payments.qrEnabled) enabled.push('qr');
  if (payments.linkEnabled) enabled.push('payment_link');
  if (payments.instructionsEnabled) enabled.push('instructions');
  if (payments.payOnPickupEnabled && deliveryMethod !== 'Delivery') {
    enabled.push('pay_on_pickup');
  }
  return enabled;
}

function resolvePaymentMethod(business, requested, deliveryMethod) {
  const enabled = enabledPaymentMethods(business, deliveryMethod);
  const normalized = normalizePaymentMethod(requested);

  if (normalized === null) {
    throw new ApiError(400, 'Please choose a valid payment method.', [
      { field: 'paymentMethod', message: 'Please choose a valid payment method.' },
    ]);
  }

  if (!enabled.length) {
    // Allow checkout without a seller payment method configured.
    return '';
  }

  if (!normalized) {
    if (enabled.length === 1) return enabled[0];
    throw new ApiError(400, 'Please choose how you will pay.', [
      { field: 'paymentMethod', message: 'Please choose how you will pay.' },
    ]);
  }

  if (!enabled.includes(normalized)) {
    throw new ApiError(400, 'That payment method is not available for this shop.', [
      { field: 'paymentMethod', message: 'That payment method is not available for this shop.' },
    ]);
  }

  return normalized;
}

async function getBusinessBySlug(slug) {
  const business = await Business.findOne({ slug: String(slug || '').toLowerCase().trim() });
  if (!business) {
    throw new ApiError(404, 'We could not find that shop.');
  }
  return business;
}

async function getStorefront(slug, { search, category } = {}) {
  const business = await getBusinessBySlug(slug);
  const filter = {
    businessId: business._id,
    status: 'Active',
  };

  if (category) {
    filter.category = category;
  }
  if (search) {
    filter.name = new RegExp(escapeRegex(search), 'i');
  }

  // Inactive shops still resolve so the public UI can show a closed state.
  const products = business.storefrontActive === false
    ? []
    : await Product.find(filter).sort({ createdAt: -1 }).limit(48);

  const categories = business.storefrontActive === false
    ? []
    : await Product.distinct('category', {
      businessId: business._id,
      status: 'Active',
      category: { $nin: ['', null] },
    });

  return {
    business,
    products,
    categories: categories.sort((a, b) => a.localeCompare(b)),
  };
}

async function getProduct(slug, productId) {
  const business = await getBusinessBySlug(slug);
  if (business.storefrontActive === false) {
    throw new ApiError(403, 'This shop is not accepting orders right now.');
  }
  const product = await Product.findOne({
    _id: productId,
    businessId: business._id,
    status: 'Active',
  });
  if (!product) {
    throw new ApiError(404, 'We could not find that product.');
  }
  return { business, product };
}

async function createOrder(slug, input) {
  const business = await getBusinessBySlug(slug);

  if (business.storefrontActive === false) {
    throw new ApiError(403, 'This shop is not accepting orders right now.');
  }

  const pickupEnabled = business.pickupEnabled !== false;
  const deliveryEnabled = business.deliveryEnabled !== false;

  if (!pickupEnabled && !deliveryEnabled) {
    throw new ApiError(403, 'This shop is not accepting orders right now.');
  }

  const method = input.deliveryMethod;
  if (method === 'Pickup' && !pickupEnabled) {
    throw new ApiError(400, 'Pickup is not available for this shop.', [
      { field: 'deliveryMethod', message: 'Pickup is not available for this shop.' },
    ]);
  }
  if (method === 'Delivery' && !deliveryEnabled) {
    throw new ApiError(400, 'Delivery is not available for this shop.', [
      { field: 'deliveryMethod', message: 'Delivery is not available for this shop.' },
    ]);
  }

  let paymentMethod = resolvePaymentMethod(business, input.paymentMethod, method);
  if (paymentMethod === 'pay_on_pickup' && method !== 'Pickup') {
    throw new ApiError(400, 'Pay on pickup is only available for pickup orders.', [
      { field: 'paymentMethod', message: 'Pay on pickup is only available for pickup orders.' },
    ]);
  }

  // Resolve the shop from the public slug. Ignore any businessId / fee from the browser.
  const deliveryFee = method === 'Delivery' ? roundMoney(business.deliveryFee || 0) : 0;
  const confirmationToken = createConfirmationToken();

  const order = await orderService.create(business._id, {
    customer: {
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email,
    },
    items: (input.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    deliveryMethod: method,
    deliveryAddress: input.deliveryAddress,
    deliveryFee,
    notes: input.notes,
    paymentMethod,
    confirmationTokenHash: hashConfirmationToken(confirmationToken),
  });

  // Non-blocking seller alerts. Failures must not undo the order.
  setImmediate(() => {
    const notifyEvents = require('./notifyEvents');
    notifyEvents.notifyNewOrder({ businessId: business._id, order }).catch(() => {});
  });

  return { business, order, confirmationToken };
}

async function getOrderConfirmation(slug, token) {
  // Same generic error for bad shape, unknown shop, or unknown token — no oracle.
  if (!isConfirmationTokenShape(token)) {
    throw new ApiError(404, CONFIRMATION_NOT_FOUND);
  }

  let business;
  try {
    business = await getBusinessBySlug(slug);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) {
      throw new ApiError(404, CONFIRMATION_NOT_FOUND);
    }
    throw err;
  }

  const order = await Order.findOne({
    businessId: business._id,
    confirmationTokenHash: hashConfirmationToken(token),
  });

  if (!order) {
    throw new ApiError(404, CONFIRMATION_NOT_FOUND);
  }

  return { business, order };
}

async function submitPaymentReference(slug, token, input) {
  const { business, order } = await getOrderConfirmation(slug, token);

  if (order.status === 'Cancelled') {
    throw new ApiError(400, 'This order is cancelled and cannot accept payment details.');
  }

  const reference = String(input.paymentReference || '').trim();
  if (reference.length > 120) {
    throw new ApiError(400, 'Payment reference must be 120 characters or fewer.', [
      { field: 'paymentReference', message: 'Payment reference must be 120 characters or fewer.' },
    ]);
  }

  const nextStatus = 'Payment Submitted';
  if (!canCustomerSetPayment(order.paymentStatus, nextStatus)
    && order.paymentStatus !== 'Payment Submitted') {
    throw new ApiError(400, 'Payment details can no longer be updated for this order.');
  }

  // Optional method change only while still awaiting payment, and only to enabled methods.
  if (Object.prototype.hasOwnProperty.call(input, 'paymentMethod') && input.paymentMethod) {
    const nextMethod = resolvePaymentMethod(business, input.paymentMethod, order.deliveryMethod);
    if (nextMethod === 'pay_on_pickup' && order.deliveryMethod !== 'Pickup') {
      throw new ApiError(400, 'Pay on pickup is only available for pickup orders.', [
        { field: 'paymentMethod', message: 'Pay on pickup is only available for pickup orders.' },
      ]);
    }
    if (['Payment Pending', 'Pending'].includes(order.paymentStatus) || order.paymentStatus === 'Payment Submitted') {
      order.paymentMethod = nextMethod;
    }
  }

  const fromStatus = order.paymentStatus;
  if (canCustomerSetPayment(fromStatus, nextStatus)) {
    order.paymentStatus = nextStatus;
    order.paymentEvents = order.paymentEvents || [];
    order.paymentEvents.push({
      at: new Date(),
      fromStatus,
      toStatus: nextStatus,
      actorType: 'customer',
      note: 'Customer submitted payment reference',
    });
  }

  if (reference) {
    order.paymentReference = reference;
    order.paymentReferenceSubmittedAt = new Date();
  } else if (!order.paymentReferenceSubmittedAt && order.paymentStatus === 'Payment Submitted') {
    // Allow marking submitted without a reference (e.g. pay on pickup confirmation).
    order.paymentReferenceSubmittedAt = new Date();
  }

  await order.save();

  // Notify only on first transition into Payment Submitted (retries must not re-email).
  if (fromStatus !== 'Payment Submitted' && order.paymentStatus === 'Payment Submitted') {
    setImmediate(() => {
      const notifyEvents = require('./notifyEvents');
      notifyEvents.notifyPaymentSubmitted({ businessId: business._id, order }).catch(() => {});
    });
  }

  return { business, order };
}

module.exports = {
  getStorefront,
  getProduct,
  createOrder,
  getOrderConfirmation,
  submitPaymentReference,
  PAYMENT_METHODS,
};
