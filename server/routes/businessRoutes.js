const express = require('express');
const { protect } = require('../middleware/auth');
const businessController = require('../controllers/businessController');

const router = express.Router();

router.use(protect);
router.get('/', businessController.getBusiness);

module.exports = router;
