const asyncHandler = require('../utils/asyncHandler');
const analyticsService = require('../services/analyticsService');
const advancedAnalyticsService = require('../services/advancedAnalyticsService');
const { sendCsv } = require('../utils/csv');

function rangeInput(req) {
  return {
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
  };
}

const getOverview = asyncHandler(async (req, res) => {
  // businessId always comes from the authenticated session.
  const analytics = await analyticsService.getOverview(req.businessId);
  res.json({ analytics });
});

const getPerformance = asyncHandler(async (req, res) => {
  res.json(await advancedAnalyticsService.getPerformance(req.businessId, rangeInput(req)));
});

const getProductPerformance = asyncHandler(async (req, res) => {
  res.json(await advancedAnalyticsService.getProductPerformance(req.businessId, rangeInput(req)));
});

const getInsights = asyncHandler(async (req, res) => {
  res.json(await advancedAnalyticsService.getInsights(req.businessId, rangeInput(req)));
});

const getSalesReport = asyncHandler(async (req, res) => {
  res.json(await advancedAnalyticsService.getSalesReport(req.businessId, rangeInput(req)));
});

function localDateTime(date, timeZone) {
  return new Date(date).toLocaleString('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const exportOrders = asyncHandler(async (req, res) => {
  const { range, orders } = await advancedAnalyticsService.ordersForExport(req.businessId, rangeInput(req));
  sendCsv(
    res,
    `cove-orders-${range.from}-to-${range.to}.csv`,
    ['Order number', 'Date', 'Customer', 'Status', 'Payment status', 'Payment method', 'Fulfilment', 'Items', 'Subtotal', 'Delivery fee', 'Total'],
    orders.map((order) => [
      order.orderNumber,
      localDateTime(order.createdAt, range.timeZone),
      order.customer?.name || '',
      order.status,
      order.paymentStatus === 'Pending' ? 'Payment Pending' : order.paymentStatus,
      order.paymentMethod || '',
      order.deliveryMethod,
      (order.items || []).reduce((sum, item) => sum + item.quantity, 0),
      order.subtotal,
      order.deliveryFee || 0,
      order.total,
    ])
  );
});

const exportProductSales = asyncHandler(async (req, res) => {
  const result = await advancedAnalyticsService.getProductPerformance(req.businessId, rangeInput(req), {
    limit: 1000,
  });
  sendCsv(
    res,
    `cove-product-sales-${result.range.from}-to-${result.range.to}.csv`,
    ['Product', 'Category', 'Views', 'Added to cart', 'Orders', 'Units sold', 'Revenue'],
    result.products.map((row) => [
      row.name,
      row.category,
      row.views,
      row.addToCart,
      row.orders,
      row.units,
      row.revenue,
    ])
  );
});

module.exports = {
  getOverview,
  getPerformance,
  getProductPerformance,
  getInsights,
  getSalesReport,
  exportOrders,
  exportProductSales,
};
