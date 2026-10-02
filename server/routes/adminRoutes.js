const express = require('express');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Every admin route: authenticated session + platform admin flag from the database.
router.use(protect, requireAdmin);
router.get('/overview', adminController.getOverview);
router.get('/businesses', adminController.listBusinesses);
router.get('/businesses/:id', adminController.getBusiness);
router.post('/businesses/:id/archive', adminController.archiveBusiness);
router.post('/businesses/:id/restore', adminController.restoreBusiness);
router.delete('/businesses/:id', adminController.deleteBusiness);
router.post('/businesses/:id/platform-admin', adminController.setOwnerPlatformAdmin);

module.exports = router;
