const mongoose = require('mongoose');
const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const emailService = require('./services/emailService');

connectDB()
  .then(() => {
    const server = app.listen(env.port, () => {
      console.log(`API listening on port ${env.port} (${env.nodeEnv})`);
      emailService.logEmailConfig();
    });

    // Hosting platforms send SIGTERM on deploy/restart; finish in-flight requests first.
    let shuttingDown = false;
    function shutdown(signal) {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal} received, shutting down.`);
      const forceExit = setTimeout(() => process.exit(1), 10000);
      forceExit.unref();
      server.close(() => {
        mongoose.disconnect().finally(() => process.exit(0));
      });
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    console.error('Could not start the API.');
    console.error(err.message);
    console.error('Paste your MongoDB Atlas connection string into MONGODB_URI in server/.env.');
    console.error('In Atlas, also allow your current IP under Network Access.');
    process.exit(1);
  });
