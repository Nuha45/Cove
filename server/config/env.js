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
const mongoUri = requireEnv('MONGODB_URI');

const placeholderUri = mongoUri.includes('USER:PASSWORD')
  || mongoUri.includes('<password>')
  || mongoUri.includes('CLUSTER.mongodb.net')
  || mongoUri.includes('127.0.0.1')
  || mongoUri.includes('localhost');

if (placeholderUri) {
  throw new Error(
    'MONGODB_URI is not a real Atlas connection string. Paste it into server/.env from Atlas -> Connect -> Drivers.'
  );
}

if (jwtSecret.length < 32 || jwtSecret.includes('replace-with')) {
  throw new Error('JWT_SECRET must be a real secret of at least 32 characters.');
}

const trialDays = Number(process.env.COVE_TRIAL_DAYS || 30);

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri,
  jwtSecret,
  jwtExpiresIn: jwtDuration.expiresIn,
  jwtMaxAgeMs: jwtDuration.maxAgeMs,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Optional until Razorpay is configured. Billing endpoints fail clearly without them.
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    planId: process.env.RAZORPAY_PLAN_ID || '',
  },
  trialDays: Number.isFinite(trialDays) && trialDays > 0 ? trialDays : 30,
  // New registrations get a server-side trial when true (default).
  grantTrialOnRegister: process.env.COVE_GRANT_TRIAL_ON_REGISTER !== 'false',
  // Phase 8A keeps the app usable while billing is tested.
  enforceBilling: process.env.COVE_ENFORCE_BILLING === 'true',
  // Optional AI marketing provider (OpenAI-compatible). Never expose to the client.
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  // Optional transactional email. Missing config must not crash the app.
  email: {
    provider: process.env.EMAIL_PROVIDER || '',
    from: process.env.EMAIL_FROM || '',
    apiKey: process.env.EMAIL_API_KEY || '',
    // When true (dev only), password-reset meta may include the reset URL for local debugging.
    debugLinks: process.env.EMAIL_DEBUG_LINKS === 'true' && (process.env.NODE_ENV || 'development') !== 'production',
  },
  appUrl: process.env.APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
