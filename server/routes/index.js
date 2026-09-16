const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./authRoutes');
const businessRoutes = require('./businessRoutes');
const productRoutes = require('./productRoutes');

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

module.exports = router;
