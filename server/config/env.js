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

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri,
  jwtSecret,
  jwtExpiresIn: jwtDuration.expiresIn,
  jwtMaxAgeMs: jwtDuration.maxAgeMs,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
