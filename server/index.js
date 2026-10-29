// server/index.js
// Main Express entry point — W4Y backend server

const dotenv = require('dotenv');
const dotenvPath = require('path').join(__dirname, '.env');
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: dotenvPath });
} else {
  dotenv.config({ path: dotenvPath, override: true });
}

// Safety Guards: Verify environment isolation and mandatory secrets
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}
if (/ds16/i.test(process.env.DATABASE_URL)) {
  throw new Error('SAFETY ERROR: DATABASE_URL must not point to any DS16 infrastructure or database name.');
}
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const projectsRoutes = require('./routes/projects');
const dashboardRoutes = require('./routes/dashboard');
const vendorRoutes = require('./routes/vendors');
const clientRoutes = require('./routes/clients');
const documentsRoutes = require('./routes/documents');
const { router: tasksRoutes, cleanupOldTasks } = require('./routes/tasks');
const settingsRoutes = require('./routes/settings');
const financeRoutes = require('./routes/finances');
const accountingRoutes = require('./routes/accounting');
const invoiceRoutes = require('./routes/invoices');
const monthlyCloseRoutes = require('./routes/monthlyClose');
const dailyReportsRoutes = require('./routes/dailyReports');

const leaveRoutes = require('./routes/leaves');
const reportsRoutes = require('./routes/reports');
const staffRoutes = require('./routes/staff');
const notificationsRoutes = require('./routes/notifications');
const builderRoutes = require('./routes/builder');
const { cleanupOldNotifications } = require('./utils/notifier');

const app = express();

// Trust reverse proxy (Nginx on VPS) for accurate IP rate limiting and geo checks
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS — in development allow all origins; in production use whitelist
const isDev = process.env.NODE_ENV !== 'production';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, same-server)
      if (!origin) return callback(null, true);
      // In development: allow everything
      if (isDev) return callback(null, true);
      // In production: check whitelist
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false); // proper CORS rejection (not a 500)
    },
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — login endpoint only (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  skip: () => process.env.NODE_ENV === 'test', // skip in tests
});
app.use('/api/auth/login', loginLimiter);

// Request logging (combined in prod, dev in dev)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'W4Y API' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/finances', financeRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/monthly-close', monthlyCloseRoutes);
app.use('/api/daily-reports', dailyReportsRoutes);

app.use('/api/leaves', leaveRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/builder', builderRoutes);

// 404 handler for API routes
app.all(/\/api\/.*/, (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Serve frontend in production (or if built locally)
const clientDistPath = path.join(__dirname, '../client/dist');
const uploadsPath = path.join(__dirname, 'uploads');
const projectsUploadsPath = path.join(uploadsPath, 'projects');

// Ensure upload directories exist
const fs = require('fs');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
if (!fs.existsSync(projectsUploadsPath)) fs.mkdirSync(projectsUploadsPath, { recursive: true });

app.use('/uploads', express.static(uploadsPath));
app.use(express.static(clientDistPath));

// Catch-all route to serve React app for non-API requests
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 W4Y API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

// Background Tasks - Only run on the first instance in cluster mode (disabled in tests)
const isPrimaryInstance = (process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0') && process.env.NODE_ENV !== 'test';

// Import and start Monthly Close Scheduler
const { startMonthlyCloseScheduler } = require('./utils/scheduler');
if (isPrimaryInstance) {
  startMonthlyCloseScheduler();
}

if (cleanupOldTasks && isPrimaryInstance) {
  setInterval(cleanupOldTasks, 24 * 60 * 60 * 1000);
  setTimeout(cleanupOldTasks, 5000);
}

const autoCheckout = attendanceRoutes.autoCheckoutPendingRecords;
if (autoCheckout && isPrimaryInstance) {
  // Run auto-checkout cleanup every hour
  setInterval(autoCheckout, 1 * 60 * 60 * 1000);
  // Also run 5 seconds after startup for immediate cleanup of past days
  setTimeout(autoCheckout, 5000);
}

if (isPrimaryInstance) {
  // Run notification maintenance every 24 hours (and 10 seconds after startup)
  setInterval(cleanupOldNotifications, 24 * 60 * 60 * 1000);
  setTimeout(cleanupOldNotifications, 10000);
}

module.exports = app;
