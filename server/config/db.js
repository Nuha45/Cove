const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  // Atlas connection strings need an SRV lookup. Some home routers refuse that
  // lookup from Node, so use public DNS for it.
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB Atlas connected');
}

module.exports = connectDB;
