const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  // MONGODB_URI in production, DEV_MONGODB_URI in development. Tests must use tests/_testDb.js, so refuse inside any test run.
  if (env.testMode || process.env.NODE_TEST_CONTEXT || !env.mongoUri) {
    throw new Error('connectDB() uses MONGODB_URI and must never run under tests. Use connectTestDB() from tests/_testDb.js.');
  }
  // Atlas connection strings need an SRV lookup. Some home routers refuse that
  // lookup from Node, so use public DNS for it.
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected: database "${env.mongoDbName || 'default'}" (${env.mongoUriVariable})`);
}

module.exports = connectDB;
