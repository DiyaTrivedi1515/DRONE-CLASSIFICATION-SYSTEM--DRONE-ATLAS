// server.js — Express + MongoDB backend for Drone Classify Atlas
// Run:  node server.js
// Env:  MONGO_URI, PORT, MODEL_PATH, MODEL_ACCURACY, FRONTEND_ORIGIN

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');

const { connectDB } = require('./config/db');
const classifyRoutes = require('./routes/classify');
const statsRoutes    = require('./routes/stats');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(morgan('dev'));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// CORS — allow the frontend origin (dev: any, prod: set FRONTEND_ORIGIN)
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || '*',
  'http://localhost:5500',    // VS Code Live Server
  'http://127.0.0.1:5500',
  'http://localhost:3001',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-session-id'],
}));

// ── Static frontend ────────────────────────────────────────────────────────
// Serve the HTML/CSS/JS files from the parent directory when running locally
app.use(express.static(path.join(__dirname, '..')));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api', classifyRoutes);
app.use('/api', statsRoutes);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Drone Classify Atlas API',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ──────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────────
(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚁  Drone Classify Atlas API`);
    console.log(`    http://localhost:${PORT}`);
    console.log(`    http://localhost:${PORT}/api/health\n`);
  });
})();
