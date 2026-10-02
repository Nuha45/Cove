// The only way automated tests connect to MongoDB. It never reads MONGODB_URI for connecting;
// MONGODB_URI is read only to prove the test database is a different database.
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const MISSING_MESSAGE = 'TEST_MONGODB_URI is required for tests. Tests must never use MONGODB_URI.';

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

function resolveTestDatabase(source = process.env) {
  const uri = String(source.TEST_MONGODB_URI || '').trim();
  if (!uri) {
    throw new Error(MISSING_MESSAGE);
  }

  let identity;
  try {
    identity = mongoIdentity(uri);
  } catch {
    throw new Error('TEST_MONGODB_URI is not a valid MongoDB connection string.');
  }
  if (!identity.dbName) {
    throw new Error('TEST_MONGODB_URI must name a dedicated test database, for example .../cove_test');
  }
  if (!/test/i.test(identity.dbName)) {
    throw new Error(`TEST_MONGODB_URI database "${identity.dbName}" must be a dedicated test database whose name contains "test" (for example cove_test).`);
  }

  const productionUri = String(source.MONGODB_URI || '').trim();
  if (productionUri) {
    let production = null;
    try {
      production = mongoIdentity(productionUri);
    } catch {
      production = null;
    }
    if (uri === productionUri || (production && sameDatabase(identity, production))) {
      throw new Error('TEST_MONGODB_URI points to the production database (MONGODB_URI). Tests must use a separate database such as cove_test.');
    }
  }

  return { uri, dbName: identity.dbName };
}

// Every test cleanup runs on the default mongoose connection, so verifying it here keeps
// deleteMany calls and index builds on the test database only.
function assertTestDatabase(connection, expectedDbName) {
  const actual = connection?.db?.databaseName || connection?.name || '';
  if (!actual || actual !== expectedDbName || !/test/i.test(actual)) {
    throw new Error(`Refusing to touch database "${actual || 'unknown'}": tests may only use "${expectedDbName}".`);
  }
  return actual;
}

async function connectTestDB() {
  const { uri, dbName } = resolveTestDatabase();
  // Same public-DNS workaround as config/db.js for Atlas SRV lookups.
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  mongoose.set('strictQuery', true);
  // autoIndex stays off until the database is verified, so no index is built anywhere else.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, autoIndex: false });
  try {
    assertTestDatabase(mongoose.connection, dbName);
  } catch (err) {
    await mongoose.disconnect();
    throw err;
  }
  // Register every model so unique indexes exist even for models other files load lazily.
  fs.readdirSync(MODELS_DIR)
    .filter((file) => file.endsWith('.js'))
    .forEach((file) => require(path.join(MODELS_DIR, file)));
  // Matches production autoIndex, where an invalid index definition is reported but not fatal.
  const models = Object.values(mongoose.models);
  const results = await Promise.allSettled(models.map((model) => model.createIndexes()));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`[test-db] index build failed for ${models[i].modelName}: ${result.reason.message}`);
    }
  });
  return dbName;
}

module.exports = {
  MISSING_MESSAGE,
  mongoIdentity,
  sameDatabase,
  resolveTestDatabase,
  assertTestDatabase,
  connectTestDB,
};
