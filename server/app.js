const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const webhookRoutes = require('./routes/webhookRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
// Rate limits and secure cookies rely on the real client IP/protocol behind a hosting proxy.
app.set('trust proxy', env.trustProxy);
app.use(helmet());
app.use(cors({
  origin: env.clientOrigins.length === 1 ? env.clientOrigins[0] : env.clientOrigins,
  credentials: true,
}));

// Razorpay signature verification needs the exact raw body — mount before JSON parsing.
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
// Product, logo, and cover images are embedded by the frontend, which may run on another origin.
app.use('/uploads', helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: env.isProduction ? '7d' : 0,
  index: false,
  dotfiles: 'ignore',
  fallthrough: false,
}));

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
