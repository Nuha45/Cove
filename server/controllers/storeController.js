const asyncHandler = require('../utils/asyncHandler');
const storeService = require('../services/storeService');
const customerWantService = require('../services/customerWantService');
const trackingService = require('../services/trackingService');

const getStorefront = asyncHandler(async (req, res) => {
  const result = await storeService.getStorefront(req.params.slug, {
    search: req.query.search,
    category: req.query.category,
  });

  if (result.paused) {
    res.json({ business: result.business.toPausedStorefront(), products: [], categories: [] });
    return;
  }

  res.json({
    business: result.business.toStorefront({ promotions: result.promotions, plus: result.plus }),
    products: result.products.map((product) => product.toStorefront()),
    categories: result.categories,
  });
});

// Always 202 so the storefront never learns why an event was or was not recorded.
const trackEvent = asyncHandler(async (req, res) => {
  await trackingService.recordEvent(req, req.params.slug, {
    type: req.body.type,
    productId: req.body.productId,
    visitorId: req.body.visitorId,
    quantity: req.body.quantity,
  });
  res.status(202).json({ ok: true });
});

const getOrderInvoice = asyncHandler(async (req, res) => {
  const { invoice, pdf } = await storeService.getOrderInvoice(req.params.slug, req.params.token);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

const getProduct = asyncHandler(async (req, res) => {
  const result = await storeService.getProduct(req.params.slug, req.params.productId);
  res.json({
    business: result.business.toStorefront(),
    product: result.product.toStorefront(),
  });
});

const createOrder = asyncHandler(async (req, res) => {
  const customer = req.body.customer || {};
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const result = await storeService.createOrder(req.params.slug, {
    customer: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    },
    items: items.map((item) => ({
      productId: item?.productId,
      quantity: item?.quantity,
    })),
    deliveryMethod: req.body.deliveryMethod,
    deliveryAddress: req.body.deliveryAddress,
    notes: req.body.notes,
    paymentMethod: req.body.paymentMethod,
    checkoutKey: req.body.checkoutKey,
  });

  // Raw token is returned only to the checkout that created the order. It is never logged or stored.
  res.status(result.replayed ? 200 : 201).json({
    order: result.order.toCustomerConfirmation(),
    business: result.business.toConfirmation(),
    confirmationToken: result.confirmationToken,
  });
});

const getOrderConfirmation = asyncHandler(async (req, res) => {
  const result = await storeService.getOrderConfirmation(req.params.slug, req.params.token);
  res.json({
    order: result.order.toCustomerConfirmation(),
    business: result.business.toConfirmation({ paused: result.paused }),
  });
});

const submitPaymentReference = asyncHandler(async (req, res) => {
  const result = await storeService.submitPaymentReference(req.params.slug, req.params.token, {
    paymentReference: req.body.paymentReference,
    paymentMethod: req.body.paymentMethod,
  });
  res.json({
    message: 'Payment details saved. The seller still needs to confirm payment.',
    order: result.order.toCustomerConfirmation(),
    business: result.business.toConfirmation(),
  });
});

const createWant = asyncHandler(async (req, res) => {
  await customerWantService.createPublic(req.params.slug, {
    name: req.body.name,
    phone: req.body.phone,
    email: req.body.email,
    request: req.body.request,
    quantity: req.body.quantity,
    notes: req.body.notes,
    shareOnBoardOptIn: req.body.shareOnBoardOptIn,
  });

  res.status(201).json({
    message: 'Request received. Thank you — the shop will review it.',
  });
});

const listWantBoard = asyncHandler(async (req, res) => {
  const result = await customerWantService.listBoard(req.params.slug, {
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json({
    shopName: result.business.name,
    wants: result.wants.map((want) => want.toBoardPublic()),
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
});

const voteWantBoard = asyncHandler(async (req, res) => {
  const want = await customerWantService.voteOnBoard(req.params.slug, req.params.wantId, req);
  res.status(201).json({
    message: 'Thanks — your interest was recorded. This is not an order.',
    want: want.toBoardPublic(),
  });
});

module.exports = {
  getStorefront,
  getProduct,
  createOrder,
  getOrderConfirmation,
  getOrderInvoice,
  trackEvent,
  submitPaymentReference,
  createWant,
  listWantBoard,
  voteWantBoard,
};
