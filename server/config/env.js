const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing. Copy server/.env.example to server/.env and fill it in.`);
  }
  return value;
}

function parseDuration(value) {
  const match = /^(\d+)([dhm])$/.exec(value);
  if (!match) {
    throw new Error('JWT_EXPIRES_IN must look like 7d, 12h, or 30m.');
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { d: 24 * 60 * 60 * 1000, h: 60 * 60 * 1000, m: 60 * 1000 };

  return {
    expiresIn: value,
    maxAgeMs: amount * multipliers[unit],
  };
}

const jwtDuration = parseDuration(process.env.JWT_EXPIRES_IN || '7d');
const jwtSecret = requireEnv('JWT_SECRET');
// Automated tests connect only through tests/_testDb.js (TEST_MONGODB_URI), never through MONGODB_URI.
const testMode = process.env.COVE_TEST_MODE === 'true';
const mongoUri = testMode ? '' : requireEnv('MONGODB_URI');

const placeholderUri = !testMode && (mongoUri.includes('USER:PASSWORD')
  || mongoUri.includes('<password>')
  || mongoUri.includes('CLUSTER.mongodb.net')
  || mongoUri.includes('127.0.0.1')
  || mongoUri.includes('localhost'));

if (placeholderUri) {
  throw new Error(
    'MONGODB_URI is not a real Atlas connection string. Paste it into server/.env from Atlas -> Connect -> Drivers.'
  );
}

if (jwtSecret.length < 32 || jwtSecret.includes('replace-with')) {
  throw new Error('JWT_SECRET must be a real secret of at least 32 characters.');
}

const { TRIAL_DAYS } = require('../utils/covePlan');

if (process.env.COVE_TRIAL_DAYS && Number(process.env.COVE_TRIAL_DAYS) !== TRIAL_DAYS) {
  console.warn(`[billing] COVE_TRIAL_DAYS is no longer used. New shops always get a ${TRIAL_DAYS}-day trial.`);
}
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

if (isProduction && !process.env.CLIENT_ORIGIN) {
  throw new Error('CLIENT_ORIGIN is required in production (the public URL of the Cove frontend).');
}
const clientOrigins = parseOrigins(process.env.CLIENT_ORIGIN || 'http://localhost:5173');

// Number of reverse-proxy hops in front of the API (hosting load balancer, CDN).
function parseTrustProxy(value) {
  if (value === undefined || value === '') return isProduction ? 1 : false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const hops = Number(value);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  throw new Error('TRUST_PROXY must be true, false, or a number of proxy hops (for example 1).');
}

function parseSameSite(value) {
  if (!value) return isProduction ? 'none' : 'lax';
  const normalized = String(value).toLowerCase();
  if (!['lax', 'strict', 'none'].includes(normalized)) {
    throw new Error('COOKIE_SAME_SITE must be lax, strict, or none.');
  }
  return normalized;
}

function parseSiteUrl(value) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PUBLIC_SITE_URL must be a full URL like https://shop.example.com');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_SITE_URL must start with https:// (or http:// for local testing).');
  }
  return url.origin;
}

module.exports = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 5000,
  mongoUri,
  testMode,
  jwtSecret,
  jwtExpiresIn: jwtDuration.expiresIn,
  jwtMaxAgeMs: jwtDuration.maxAgeMs,
  clientOrigin: clientOrigins[0],
  clientOrigins,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Temporary diagnostic: logs how the first 20 requests' client IPs resolve behind the proxies.
  logProxyIps: process.env.LOG_PROXY_IPS === 'true',
  cookieSameSite: parseSameSite(process.env.COOKIE_SAME_SITE),
  // Public frontend origin used for sitemap URLs. Sitemap is disabled until this is set.
  publicSiteUrl: parseSiteUrl(process.env.PUBLIC_SITE_URL),
  // Optional until Razorpay is configured. Billing endpoints fail clearly without them.
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    // ₹599 Cove Basic plan (internal key "pro"). RAZORPAY_PLAN_ID is the original name and still works.
    planId: process.env.RAZORPAY_PRO_PLAN_ID || process.env.RAZORPAY_PLAN_ID || '',
    // Separate ₹899 Razorpay plan for Cove Plus (internal key "advanced"). Plus checkout is disabled until set.
    advancedPlanId: process.env.RAZORPAY_ADVANCED_PLAN_ID || '',
  },
  // Shared secret for scheduled-job endpoints (weekly reports). Jobs are disabled until set.
  cronSecret: process.env.CRON_SECRET || '',
  // Time zone used to bucket analytics by day and hour.
  analyticsTimeZone: (() => {
    const zone = process.env.COVE_ANALYTICS_TIMEZONE || 'Asia/Kolkata';
    try {
      Intl.DateTimeFormat('en-US', { timeZone: zone });
      return zone;
    } catch {
      throw new Error('COVE_ANALYTICS_TIMEZONE must be a valid IANA time zone like Asia/Kolkata.');
    }
  })(),
  trialDays: TRIAL_DAYS,
  // New registrations get a server-side trial when true (default).
  grantTrialOnRegister: process.env.COVE_GRANT_TRIAL_ON_REGISTER !== 'false',
  // Pauses the storefront and new orders once a shop has no trial or paid access.
  // On unless explicitly set to "false".
  enforceBilling: process.env.COVE_ENFORCE_BILLING !== 'false',
  // Image storage. Uploads fail with a clear error until all three values are set.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  // Automated tests only. Ignored when NODE_ENV=production.
  imageStorage: (() => {
    const requested = process.env.IMAGE_STORAGE === 'memory';
    if (requested && isProduction) {
      console.warn('[images] IMAGE_STORAGE=memory is ignored when NODE_ENV=production.');
      return 'cloudinary';
    }
    return requested ? 'memory' : 'cloudinary';
  })(),
  // Optional transactional email. Missing config must not crash the app.
  email: {
    provider: process.env.EMAIL_PROVIDER || '',
    from: process.env.EMAIL_FROM || '',
    apiKey: process.env.EMAIL_API_KEY || '',
    // When true (dev only), password-reset meta may include the reset URL for local debugging.
    debugLinks: process.env.EMAIL_DEBUG_LINKS === 'true' && (process.env.NODE_ENV || 'development') !== 'production',
  },
  appUrl: process.env.APP_URL || clientOrigins[0],
};

// Production keeps running without these, but the related feature is silently unavailable.
if (isProduction) {
  const missing = [
    ['RAZORPAY_KEY_ID', module.exports.razorpay.keyId],
    ['RAZORPAY_KEY_SECRET', module.exports.razorpay.keySecret],
    ['RAZORPAY_WEBHOOK_SECRET', module.exports.razorpay.webhookSecret],
    ['RAZORPAY_PRO_PLAN_ID', module.exports.razorpay.planId],
    ['RAZORPAY_ADVANCED_PLAN_ID', module.exports.razorpay.advancedPlanId],
    ['EMAIL_PROVIDER', module.exports.email.provider],
    ['EMAIL_FROM', module.exports.email.from],
    ['EMAIL_API_KEY', module.exports.email.apiKey],
    ['CLOUDINARY_CLOUD_NAME', module.exports.cloudinary.cloudName],
    ['CLOUDINARY_API_KEY', module.exports.cloudinary.apiKey],
    ['CLOUDINARY_API_SECRET', module.exports.cloudinary.apiSecret],
    ['PUBLIC_SITE_URL', module.exports.publicSiteUrl],
    ['CRON_SECRET', module.exports.cronSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    console.warn(`[config] Not set in production: ${missing.join(', ')}. Related features stay off until they are.`);
  }
  const emailProvider = module.exports.email.provider;
  if (emailProvider && emailProvider !== 'resend') {
    console.warn(`[config] EMAIL_PROVIDER=${emailProvider} does not deliver email. Use EMAIL_PROVIDER=resend in production.`);
  }
}
