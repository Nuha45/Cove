const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./authRoutes');
const businessRoutes = require('./businessRoutes');
const productRoutes = require('./productRoutes');
const orderRoutes = require('./orderRoutes');
const storeRoutes = require('./storeRoutes');
const customerRoutes = require('./customerRoutes');
const customerWantRoutes = require('./customerWantRoutes');
const billingRoutes = require('./billingRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const notificationRoutes = require('./notificationRoutes');
const adminRoutes = require('./adminRoutes');
const seoRoutes = require('./seoRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const jobRoutes = require('./jobRoutes');

const router = express.Router();

// Load balancers treat non-2xx as unhealthy, so report 503 while the database is unreachable.
router.get('/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'degraded',
    database: connected ? 'connected' : 'disconnected',
  });
});

router.use('/auth', authRoutes);
router.use('/business', businessRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/customers', customerRoutes);
router.use('/customer-wants', customerWantRoutes);
router.use('/billing', billingRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/store', storeRoutes);
router.use('/admin', adminRoutes);
router.use('/seo', seoRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/jobs', jobRoutes);

module.exports = router;
