const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const StoreEvent = require('../models/StoreEvent');
const Business = require('../models/Business');
const env = require('../config/env');
const { formatMoney } = require('../utils/currencies');
const { resolveRange } = require('../utils/dateRange');

// Minimum sample sizes before Cove states an insight. Below these the UI shows an empty state.
const MIN_VIEWS_FOR_INSIGHT = 30;
const MIN_CARTS_FOR_INSIGHT = 15;
const MIN_VISITS_FOR_ACTIVITY = 50;
const MIN_VIEWS_FOR_NO_CONVERSION_FLAG = 10;

const PRICE_BUCKETS = [0, 250, 500, 1000, 2000, 5000, 10000];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function oid(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function percent(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function rangeFor(input, now) {
  return resolveRange(input, { timeZone: env.analyticsTimeZone, now });
}

function publicRange(range) {
  return {
    key: range.key,
    from: range.from,
    to: range.to,
    days: range.days,
    label: range.label,
    timeZone: range.timeZone,
  };
}

const notCancelled = { status: { $ne: 'Cancelled' } };

async function eventTotals(businessId, range) {
  const rows = await StoreEvent.aggregate([
    { $match: { businessId: oid(businessId), createdAt: { $gte: range.start, $lt: range.end } } },
    { $group: { _id: { type: '$type', visitor: '$visitorHash' }, events: { $sum: 1 } } },
    { $group: { _id: '$_id.type', events: { $sum: '$events' }, visitors: { $sum: 1 } } },
  ]);
  const totals = {
    visit: { events: 0, visitors: 0 },
    product_view: { events: 0, visitors: 0 },
    add_to_cart: { events: 0, visitors: 0 },
  };
  rows.forEach((row) => {
    if (totals[row._id]) totals[row._id] = { events: row.events, visitors: row.visitors };
  });
  return totals;
}

async function orderTotals(businessId, range) {
  const [row] = await Order.aggregate([
    { $match: { businessId: oid(businessId), createdAt: { $gte: range.start, $lt: range.end } } },
    {
      $group: {
        _id: null,
        allOrders: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
        orders: { $sum: { $cond: [{ $ne: ['$status', 'Cancelled'] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $ne: ['$status', 'Cancelled'] }, '$total', 0] } },
        // Only public storefront checkouts carry a confirmation token; seller-entered orders do not.
        storefrontOrders: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', 'Cancelled'] },
                  { $gt: [{ $ifNull: ['$confirmationTokenHash', ''] }, ''] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  return {
    allOrders: row?.allOrders || 0,
    cancelled: row?.cancelled || 0,
    orders: row?.orders || 0,
    revenue: roundMoney(row?.revenue || 0),
    storefrontOrders: row?.storefrontOrders || 0,
  };
}

function bucketFormat(range) {
  return range.days <= 62 ? '%Y-%m-%d' : '%Y-%m';
}

function bucketKeys(range) {
  if (range.days <= 62) return range.dayKeys;
  const keys = [];
  range.dayKeys.forEach((day) => {
    const month = day.slice(0, 7);
    if (!keys.includes(month)) keys.push(month);
  });
  return keys;
}

function bucketLabel(key) {
  if (key.length === 7) {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function trend(businessId, range) {
  const format = bucketFormat(range);
  const dateExpr = { $dateToString: { format, date: '$createdAt', timezone: range.timeZone } };
  const [orderRows, visitorRows] = await Promise.all([
    Order.aggregate([
      { $match: { businessId: oid(businessId), createdAt: { $gte: range.start, $lt: range.end }, ...notCancelled } },
      { $group: { _id: dateExpr, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
    ]),
    StoreEvent.aggregate([
      { $match: { businessId: oid(businessId), type: 'visit', createdAt: { $gte: range.start, $lt: range.end } } },
      { $group: { _id: { bucket: dateExpr, visitor: '$visitorHash' } } },
      { $group: { _id: '$_id.bucket', visitors: { $sum: 1 } } },
    ]),
  ]);
  const orderMap = Object.fromEntries(orderRows.map((row) => [row._id, row]));
  const visitorMap = Object.fromEntries(visitorRows.map((row) => [row._id, row.visitors]));
  return bucketKeys(range).map((key) => ({
    key,
    label: bucketLabel(key),
    orders: orderMap[key]?.orders || 0,
    revenue: roundMoney(orderMap[key]?.revenue || 0),
    visitors: visitorMap[key] || 0,
  }));
}

async function getPerformance(businessId, input = {}, { now = new Date() } = {}) {
  const range = rangeFor(input, now);
  const [events, orders, series] = await Promise.all([
    eventTotals(businessId, range),
    orderTotals(businessId, range),
    trend(businessId, range),
  ]);

  const uniqueVisitors = events.visit.visitors;
  const funnelSteps = [
    { key: 'visitors', label: 'Visitors', value: uniqueVisitors },
    { key: 'viewers', label: 'Viewed a product', value: events.product_view.visitors },
    { key: 'carts', label: 'Added to cart', value: events.add_to_cart.visitors },
    { key: 'orders', label: 'Ordered', value: orders.storefrontOrders },
  ];
  const funnel = funnelSteps.map((step, index) => ({
    ...step,
    ofPrevious: index === 0 ? null : percent(step.value, funnelSteps[index - 1].value),
    ofFirst: index === 0 ? null : percent(step.value, uniqueVisitors),
  }));

  return {
    range: publicRange(range),
    metrics: {
      visits: events.visit.events,
      uniqueVisitors,
      productViews: events.product_view.events,
      addToCart: events.add_to_cart.events,
      orders: orders.orders,
      storefrontOrders: orders.storefrontOrders,
      cancelledOrders: orders.cancelled,
      revenue: orders.revenue,
      averageOrderValue: orders.orders ? roundMoney(orders.revenue / orders.orders) : 0,
      addToCartRate: percent(events.add_to_cart.visitors, uniqueVisitors),
      conversionRate: percent(orders.storefrontOrders, uniqueVisitors),
    },
    funnel,
    trend: series,
  };
}

async function productEventCounts(businessId, range) {
  return StoreEvent.aggregate([
    {
      $match: {
        businessId: oid(businessId),
        type: { $in: ['product_view', 'add_to_cart'] },
        createdAt: { $gte: range.start, $lt: range.end },
      },
    },
    { $group: { _id: { productId: '$productId', type: '$type' }, count: { $sum: 1 } } },
  ]);
}

async function productSales(businessId, range) {
  return Order.aggregate([
    { $match: { businessId: oid(businessId), createdAt: { $gte: range.start, $lt: range.end }, ...notCancelled } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        name: { $last: '$items.name' },
        units: { $sum: '$items.quantity' },
        orders: { $sum: 1 },
        revenue: { $sum: '$items.subtotal' },
      },
    },
  ]);
}

async function getProductPerformance(businessId, input = {}, { now = new Date(), limit = 100 } = {}) {
  const range = rangeFor(input, now);
  const [eventRows, salesRows] = await Promise.all([
    productEventCounts(businessId, range),
    productSales(businessId, range),
  ]);

  const rows = new Map();
  const rowFor = (id) => {
    const key = String(id);
    if (!rows.has(key)) {
      rows.set(key, { productId: key, name: '', views: 0, addToCart: 0, units: 0, orders: 0, revenue: 0 });
    }
    return rows.get(key);
  };
  eventRows.forEach((row) => {
    if (!row._id.productId) return;
    const item = rowFor(row._id.productId);
    if (row._id.type === 'product_view') item.views = row.count;
    if (row._id.type === 'add_to_cart') item.addToCart = row.count;
  });
  salesRows.forEach((row) => {
    if (!row._id) return;
    const item = rowFor(row._id);
    item.units = row.units;
    item.orders = row.orders;
    item.revenue = roundMoney(row.revenue);
    item.name = item.name || row.name;
  });

  const ids = [...rows.keys()].filter((id) => mongoose.isValidObjectId(id));
  const products = ids.length
    ? await Product.find({ _id: { $in: ids }, businessId }).select('name category status stockQuantity price').lean()
    : [];
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const list = [...rows.values()]
    .filter((row) => productMap.has(row.productId) || row.name)
    .map((row) => {
      const product = productMap.get(row.productId);
      return {
        ...row,
        name: product?.name || row.name,
        category: product?.category || '',
        status: product?.status || 'Removed',
        stockQuantity: product ? product.stockQuantity : null,
        viewToOrderRate: row.views ? percent(row.orders, row.views) : null,
        cartToOrderRate: row.addToCart ? percent(row.orders, row.addToCart) : null,
        needsAttention: row.views >= MIN_VIEWS_FOR_NO_CONVERSION_FLAG && row.orders === 0,
      };
    });

  const by = (field) => list
    .filter((row) => row[field] > 0)
    .sort((a, b) => b[field] - a[field] || b.revenue - a.revenue)
    .slice(0, 5)
    .map((row) => ({ productId: row.productId, name: row.name, value: row[field] }));

  return {
    range: publicRange(range),
    products: list
      .sort((a, b) => b.views - a.views || b.revenue - a.revenue || a.name.localeCompare(b.name))
      .slice(0, limit),
    totalProducts: list.length,
    topViewed: by('views'),
    topAddedToCart: by('addToCart'),
    bestSellers: by('units'),
    attentionThreshold: MIN_VIEWS_FOR_NO_CONVERSION_FLAG,
  };
}

function priceBucketLabel(lower, currency) {
  const index = PRICE_BUCKETS.indexOf(lower);
  const upper = PRICE_BUCKETS[index + 1];
  const fmt = (value) => formatMoney(value, currency);
  if (upper === undefined) return `${fmt(lower)}+`;
  return `${fmt(lower)}–${fmt(upper)}`;
}

function hourLabel(hour) {
  const h = hour % 24;
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${suffix}`;
}

async function getInsights(businessId, input = {}, { now = new Date() } = {}) {
  const range = rangeFor(input, now);
  const match = { businessId: oid(businessId), createdAt: { $gte: range.start, $lt: range.end } };

  const [categoryRows, priceRows, activityRows, business] = await Promise.all([
    StoreEvent.aggregate([
      { $match: { ...match, type: { $in: ['product_view', 'add_to_cart'] } } },
      { $group: { _id: { type: '$type', category: '$category' }, count: { $sum: 1 } } },
    ]),
    StoreEvent.aggregate([
      { $match: { ...match, type: 'product_view', price: { $ne: null } } },
      {
        $bucket: {
          groupBy: '$price',
          boundaries: [...PRICE_BUCKETS, Number.MAX_SAFE_INTEGER],
          default: 'other',
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    StoreEvent.aggregate([
      { $match: { ...match, type: 'visit' } },
      {
        $group: {
          _id: {
            day: { $dayOfWeek: { date: '$createdAt', timezone: range.timeZone } },
            hour: { $hour: { date: '$createdAt', timezone: range.timeZone } },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Business.findById(businessId).select('currency').lean(),
  ]);

  const categoryTop = (type, minimum) => {
    const rows = categoryRows.filter((row) => row._id.type === type);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const named = rows.filter((row) => row._id.category).sort((a, b) => b.count - a.count);
    if (total < minimum || !named.length) return { available: false, sample: total, minimum };
    return {
      available: true,
      value: named[0]._id.category,
      share: percent(named[0].count, total),
      sample: total,
      minimum,
    };
  };

  const priceTotal = priceRows.reduce((sum, row) => sum + row.count, 0);
  const topPrice = priceRows.filter((row) => row._id !== 'other').sort((a, b) => b.count - a.count)[0];
  const priceRange = priceTotal >= MIN_VIEWS_FOR_INSIGHT && topPrice
    ? {
      available: true,
      value: priceBucketLabel(topPrice._id, business?.currency),
      share: percent(topPrice.count, priceTotal),
      sample: priceTotal,
      minimum: MIN_VIEWS_FOR_INSIGHT,
    }
    : { available: false, sample: priceTotal, minimum: MIN_VIEWS_FOR_INSIGHT };

  const visits = activityRows.reduce((sum, row) => sum + row.count, 0);
  let activity = { available: false, sample: visits, minimum: MIN_VISITS_FOR_ACTIVITY };
  if (visits >= MIN_VISITS_FOR_ACTIVITY) {
    const byDay = WEEKDAYS.map((label) => ({ label, visits: 0 }));
    const byBlock = Array.from({ length: 8 }, (_, index) => ({
      label: `${hourLabel(index * 3)}–${hourLabel(index * 3 + 3)}`,
      visits: 0,
    }));
    activityRows.forEach((row) => {
      byDay[row._id.day - 1].visits += row.count;
      byBlock[Math.floor(row._id.hour / 3)].visits += row.count;
    });
    const busiestBlock = [...byBlock].sort((a, b) => b.visits - a.visits)[0];
    const busiestDay = [...byDay].sort((a, b) => b.visits - a.visits)[0];
    activity = {
      available: true,
      sample: visits,
      minimum: MIN_VISITS_FOR_ACTIVITY,
      mostActivePeriod: busiestBlock.label,
      mostActiveDay: busiestDay.label,
      byDay,
      byBlock,
    };
  }

  return {
    range: publicRange(range),
    insights: {
      topViewedCategory: categoryTop('product_view', MIN_VIEWS_FOR_INSIGHT),
      topCartCategory: categoryTop('add_to_cart', MIN_CARTS_FOR_INSIGHT),
      popularPriceRange: priceRange,
      activity,
    },
  };
}

async function getSalesReport(businessId, input = {}, { now = new Date() } = {}) {
  const range = rangeFor(input, now);
  const [orders, series, sales] = await Promise.all([
    orderTotals(businessId, range),
    trend(businessId, range),
    productSales(businessId, range),
  ]);
  const productRows = sales
    .map((row) => ({
      productId: String(row._id),
      name: row.name,
      units: row.units,
      orders: row.orders,
      revenue: roundMoney(row.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units);
  return {
    range: publicRange(range),
    summary: {
      orders: orders.orders,
      cancelledOrders: orders.cancelled,
      revenue: orders.revenue,
      averageOrderValue: orders.orders ? roundMoney(orders.revenue / orders.orders) : 0,
      unitsSold: productRows.reduce((sum, row) => sum + row.units, 0),
    },
    trend: series.map(({ key, label, orders: count, revenue }) => ({ key, label, orders: count, revenue })),
    products: productRows.slice(0, 50),
    bestSellers: [...productRows].sort((a, b) => b.units - a.units).slice(0, 5),
  };
}

const ORDER_EXPORT_LIMIT = 5000;

async function ordersForExport(businessId, input = {}, { now = new Date() } = {}) {
  const range = rangeFor(input, now);
  const orders = await Order.find({
    businessId,
    createdAt: { $gte: range.start, $lt: range.end },
  })
    .sort({ createdAt: -1 })
    .limit(ORDER_EXPORT_LIMIT)
    .select('orderNumber createdAt customer.name status paymentStatus paymentMethod deliveryMethod items subtotal deliveryFee total')
    .lean();
  return { range, orders };
}

module.exports = {
  getPerformance,
  getProductPerformance,
  getInsights,
  getSalesReport,
  ordersForExport,
  rangeFor,
  MIN_VIEWS_FOR_INSIGHT,
  MIN_CARTS_FOR_INSIGHT,
  MIN_VISITS_FOR_ACTIVITY,
  ORDER_EXPORT_LIMIT,
};
