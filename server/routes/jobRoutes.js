const crypto = require('crypto');
const express = require('express');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { cronLimiter } = require('../middleware/rateLimiter');
const weeklyReportService = require('../services/weeklyReportService');

const router = express.Router();

function secretMatches(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Called by an external scheduler (see server/.env.example → CRON_SECRET).
function requireCronSecret(req, res, next) {
  if (!env.cronSecret) {
    next(new ApiError(503, 'Scheduled jobs are not configured on this server.'));
    return;
  }
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secretMatches(token, env.cronSecret)) {
    next(new ApiError(401, 'Not authorized.'));
    return;
  }
  next();
}

router.post(
  '/weekly-reports',
  cronLimiter,
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const summary = await weeklyReportService.runWeeklyReports();
    res.json({ ok: true, summary });
  })
);

module.exports = router;
