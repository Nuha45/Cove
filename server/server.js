const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');

connectDB()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`API listening on http://localhost:${env.port}`);
    });
  })
  .catch((err) => {
    console.error('Could not start the API.');
    console.error(err.message);
    console.error('Paste your MongoDB Atlas connection string into MONGODB_URI in server/.env.');
    console.error('In Atlas, also allow your current IP under Network Access.');
    process.exit(1);
  });
