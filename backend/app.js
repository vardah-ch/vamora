'use strict';
require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { requestId, errorHandler } = require('./src/utils/http');

const NODE_ENV = process.env.NODE_ENV || 'development';
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(requestId);
app.use(helmet({
  // Media is fetched by the SPA from another origin in development.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false // API returns JSON/media only; CSP belongs on the frontend host.
}));
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Request logging WITHOUT query strings (signed media URLs) or bodies.
if (NODE_ENV !== 'test') {
  morgan.token('safe-url', (req) => (req.originalUrl || req.url).split('?')[0]);
  app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));
}

// ── Rate limits (audit S9) ──────────────────────────────────────────────────
const limiter = (windowMs, limit, keyFn) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: keyFn || ((req) => req.ip),
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
  message: { status: 'error', message: 'Too many attempts. Please wait a few minutes and try again.' }
});
const loginLimiter = limiter(15 * 60 * 1000, Number(process.env.LOGIN_RATE_LIMIT) || 10,
  (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`);
const passwordResetLimiter = limiter(60 * 60 * 1000, 5);
const registerLimiter = limiter(60 * 60 * 1000, Number(process.env.REGISTER_RATE_LIMIT) || 20);
const aiLimiter = limiter(60 * 1000, Number(process.env.AI_RATE_LIMIT) || 20, (req) => `ai|${req.headers.authorization || req.ip}`);

app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth/forgot-password', passwordResetLimiter);
app.use('/api/v1/auth/reset-password', passwordResetLimiter);
app.use('/api/v1/auth/register', registerLimiter);
app.use('/api/v1/companion/chat', aiLimiter);

// NOTE (audit S6): there is intentionally NO `express.static('/uploads')`.
// Media is served only through /api/v1/media with signed, expiring URLs.

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'VAMORA API is running', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'VAMORA API',
    version: 'v1',
    docs: 'docs/API.md'
  });
});

app.use('/api/v1/auth', require('./src/routes/authRoutes'));
app.use('/api/v1/users', require('./src/routes/userRoutes'));
app.use('/api/v1/photos', require('./src/routes/photos'));
app.use('/api/v1/media', require('./src/routes/mediaRoutes'));
app.use('/api/v1/memories', require('./src/routes/memoryRoutes'));
app.use('/api/v1/caregiver', require('./src/routes/caregiverRoutes'));
app.use('/api/v1/moods', require('./src/routes/moodRoutes'));
app.use('/api/v1/companion', require('./src/routes/companionRoutes'));
app.use('/api/v1/doctor', require('./src/routes/doctorRoutes'));
app.use('/api/v1/super-admin', require('./src/routes/superAdminRoutes'));
app.use('/api/v1/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/v1/privacy', require('./src/routes/privacyRoutes'));

app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found', error: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
