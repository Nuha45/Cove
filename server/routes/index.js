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
const marketingRoutes = require('./marketingRoutes');
const analyticsRoutes = require('./analyticsRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
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
router.use('/marketing', marketingRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/store', storeRoutes);

module.exports = router;
