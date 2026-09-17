const express = require('express');
const { protect } = require('../middleware/auth');
const analyticsController = require('../controllers/analyticsController');

const router = express.Router();

router.use(protect);
router.get('/', analyticsController.getOverview);

module.exports = router;
