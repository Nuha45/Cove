const express = require('express');
const { protect } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { updateSettingsRules } = require('../validators/businessValidator');
const businessController = require('../controllers/businessController');

const router = express.Router();

router.use(protect);
router.get('/', businessController.getBusiness);
router.get('/settings', businessController.getSettings);
router.patch('/settings', writeLimiter, updateSettingsRules, validate, businessController.updateSettings);

module.exports = router;
