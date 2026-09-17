const express = require('express');
const { protect } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { generateRules } = require('../validators/marketingValidator');
const marketingController = require('../controllers/marketingController');

const router = express.Router();

router.use(protect);
router.get('/status', marketingController.getStatus);
router.post('/generate', aiLimiter, generateRules, validate, marketingController.generate);

module.exports = router;
