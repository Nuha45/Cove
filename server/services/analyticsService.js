const mongoose = require('mongoose');
const env = require('../config/env');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const CustomerWant = require('../models/CustomerWant');
const { STATUSES } = require('../utils/orderStatus');
const { STATUSES: WANT_STATUSES } = require('../utils/customerWantStatus');
const { resolveRange } = require('../utils/dateRange');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function dayLabel(key) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

function oid(businessId) {
  return new mongoose.Types.ObjectId(String(businessId));
}

const nonCancelled = { $ne: ['$status', 'Cancelled'] };

async function getOverview(businessId) {
  const businessObjectId = oid(businessId);
  const timeZone = env.analyticsTimeZone;
  const now = new Date();
  const today = resolveRange({ range: 'today' }, { timeZone, now }).start;
  const week = resolveRange({ range: '7d' }, { timeZone, now });
  const weekStart = week.start;
  const monthStart = resolveRange({ range: 'month' }, { timeZone, now }).start;

  const [orderStats] = await Order.aggregate([
    { $match: { businessId: businessObjectId } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSales: {
          $sum: { $cond: [nonCancelled, '$total', 0] },
        },
        salesToday: {
          $sum: {
            $cond: [
              { $and: [nonCancelled, { $gte: ['$createdAt', today] }] },
              '$total',
              0,
            ],
          },
        },
        salesWeek: {
          $sum: {
            $cond: [
              { $and: [nonCancelled, { $gte: ['$createdAt', weekStart] }] },
              '$total',
              0,
            ],
          },
        },
        salesMonth: {
          $sum: {
            $cond: [
              { $and: [nonCancelled, { $gte: ['$createdAt', monthStart] }] },
              '$total',
              0,
            ],
          },
        },
      },
    },
  ]);

  const statusRows = await Order.aggregate([
    { $match: { businessId: businessObjectId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const orderStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  statusRows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(orderStatus, row._id)) {
      orderStatus[row._id] = row.count;
    }
  });

  const [customerStats] = await Customer.aggregate([
    { $match: { businessId: businessObjectId } },
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        newCustomers: {
          $sum: { $cond: [{ $lte: ['$totalOrders', 1] }, 1, 0] },
        },
        returningCustomers: {
          $sum: { $cond: [{ $gte: ['$totalOrders', 2] }, 1, 0] },
        },
      },
    },
  ]);

  const wantRows = await CustomerWant.aggregate([
    { $match: { businessId: businessObjectId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const customerWants = {
    total: 0,
    ...Object.fromEntries(WANT_STATUSES.map((status) => [status, 0])),
  };
  wantRows.forEach((row) => {
    customerWants.total += row.count;
    if (Object.prototype.hasOwnProperty.call(customerWants, row._id)) {
      customerWants[row._id] = row.count;
    }
  });

  const topProducts = await Order.aggregate([
    {
      $match: {
        businessId: businessObjectId,
        status: { $ne: 'Cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: {
          productId: '$items.productId',
          name: '$items.name',
        },
        quantitySold: { $sum: '$items.quantity' },
      },
    },
    { $sort: { quantitySold: -1 } },
    { $limit: 5 },
    {
      $project: {
        _id: 0,
        productId: { $toString: '$_id.productId' },
        name: '$_id.name',
        quantitySold: 1,
      },
    },
  ]);

  const trendStart = weekStart;
  const trendRows = await Order.aggregate([
    {
      $match: {
        businessId: businessObjectId,
        status: { $ne: 'Cancelled' },
        createdAt: { $gte: trendStart },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: timeZone,
          },
        },
        sales: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
  ]);
  const trendMap = Object.fromEntries(
    trendRows.map((row) => [row._id, { sales: roundMoney(row.sales), orders: row.orders }])
  );
  const salesTrend = week.dayKeys.map((key) => ({
    date: key,
    label: dayLabel(key),
    sales: trendMap[key]?.sales || 0,
    orders: trendMap[key]?.orders || 0,
  }));

  return {
    summary: {
      totalSales: roundMoney(orderStats?.totalSales || 0),
      totalOrders: orderStats?.totalOrders || 0,
      totalCustomers: customerStats?.totalCustomers || 0,
      customerWants: customerWants.total,
      salesToday: roundMoney(orderStats?.salesToday || 0),
      salesThisWeek: roundMoney(orderStats?.salesWeek || 0),
      salesThisMonth: roundMoney(orderStats?.salesMonth || 0),
    },
    orderStatus,
    customers: {
      total: customerStats?.totalCustomers || 0,
      new: customerStats?.newCustomers || 0,
      returning: customerStats?.returningCustomers || 0,
    },
    customerWants: {
      total: customerWants.total,
      New: customerWants.New,
      'In Progress': customerWants['In Progress'],
      Fulfilled: customerWants.Fulfilled,
      Closed: customerWants.Closed,
    },
    topProducts,
    salesTrend,
  };
}

module.exports = {
  getOverview,
};
