const express = require('express');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const seoService = require('../services/seoService');

const router = express.Router();

router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  if (!env.publicSiteUrl) {
    throw new ApiError(404, 'Not found.');
  }
  const entries = await seoService.sitemapEntries();
  res
    .type('application/xml')
    .set('Cache-Control', 'public, max-age=3600')
    .send(seoService.buildSitemapXml(env.publicSiteUrl, entries));
}));

module.exports = router;
