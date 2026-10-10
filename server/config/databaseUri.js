// Chooses the MongoDB database the app connects to. Only NODE_ENV=production uses MONGODB_URI.
// Development needs its own DEV_MONGODB_URI, so a local server can never write to production.

const PLACEHOLDERS = ['USER:PASSWORD', '<password>', 'CLUSTER.mongodb.net'];

const DEV_MISSING_MESSAGE = 'DEV_MONGODB_URI is required outside production. Add a separate development database '
  + '(for example .../cove_dev) to server/.env. Only NODE_ENV=production connects to MONGODB_URI.';

// Returns { scheme, hosts, dbName } with formatting, credentials and options stripped,
// so equivalent connection strings compare equal.
function mongoIdentity(uri) {
  const match = /^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?#]+)(?:\/([^?#]*))?/i.exec(String(uri || '').trim());
  if (!match) {
    throw new Error('Not a MongoDB connection string.');
  }
  const scheme = match[1].toLowerCase();
  const hosts = match[2]
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => (scheme === 'mongodb' && !/:\d+$/.test(host) ? `${host}:27017` : host))
    .sort();
  const dbName = decodeURIComponent(match[3] || '').trim();
  return { scheme, hosts, dbName };
}

// MongoDB treats database names case-insensitively for uniqueness. An SRV record and a plain host
// list cannot be compared without DNS, so the same database name on both is treated as the same.
function sameDatabase(a, b) {
  if (a.dbName.toLowerCase() !== b.dbName.toLowerCase()) return false;
  if (a.scheme !== b.scheme) return true;
  return a.hosts.some((host) => b.hosts.includes(host));
}

// True when `uri` is the same database as the production MONGODB_URI in `source`.
function isProductionDatabase(uri, identity, source) {
  const productionUri = String(source.MONGODB_URI || '').trim();
  if (!productionUri) return false;
  if (uri === productionUri) return true;
  try {
    return sameDatabase(identity, mongoIdentity(productionUri));
  } catch {
    return false;
  }
}

function resolveProductionDatabase(source) {
  const uri = String(source.MONGODB_URI || '').trim();
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Copy server/.env.example to server/.env and fill it in.');
  }
  if (PLACEHOLDERS.some((value) => uri.includes(value)) || uri.includes('127.0.0.1') || uri.includes('localhost')) {
    throw new Error(
      'MONGODB_URI is not a real Atlas connection string. Paste it into server/.env from Atlas -> Connect -> Drivers.'
    );
  }
  let dbName = '';
  try {
    ({ dbName } = mongoIdentity(uri));
  } catch {
    dbName = '';
  }
  return { uri, dbName, variable: 'MONGODB_URI' };
}

function resolveDevelopmentDatabase(source) {
  const uri = String(source.DEV_MONGODB_URI || '').trim();
  if (!uri) {
    throw new Error(DEV_MISSING_MESSAGE);
  }
  let identity;
  try {
    identity = mongoIdentity(uri);
  } catch {
    throw new Error('DEV_MONGODB_URI is not a valid MongoDB connection string.');
  }
  if (PLACEHOLDERS.some((value) => uri.includes(value))) {
    throw new Error('DEV_MONGODB_URI still contains placeholder values. Paste a real connection string.');
  }
  if (!identity.dbName) {
    throw new Error('DEV_MONGODB_URI must name a development database, for example .../cove_dev');
  }
  if (isProductionDatabase(uri, identity, source)) {
    throw new Error(
      'DEV_MONGODB_URI points to the production database (MONGODB_URI). Use a separate database such as cove_dev.'
    );
  }
  return { uri, dbName: identity.dbName, variable: 'DEV_MONGODB_URI' };
}

// { uri, dbName, variable } for the running app. Tests get no URI: they connect through tests/_testDb.js.
function resolveAppDatabase(source = process.env) {
  if (source.COVE_TEST_MODE === 'true') {
    return { uri: '', dbName: '', variable: '' };
  }
  if ((source.NODE_ENV || 'development') === 'production') {
    return resolveProductionDatabase(source);
  }
  return resolveDevelopmentDatabase(source);
}

module.exports = {
  DEV_MISSING_MESSAGE,
  mongoIdentity,
  sameDatabase,
  resolveAppDatabase,
};
