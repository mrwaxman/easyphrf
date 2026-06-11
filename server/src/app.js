'use strict';

const express = require('express');
const cors = require('cors');
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

/**
 * Build the Express app. Exported as a factory so tests can construct an
 * instance without starting a listener and without loading Clerk.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.enableClerk] Mount Clerk middleware (default: true
 *   outside of tests). Tests leave it off and use the auth test hook.
 */
function createApp({ enableClerk = process.env.NODE_ENV !== 'test' } = {}) {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_URL || true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/v1/health', (req, res) => res.json({ status: 'ok' }));

  // Public surface (no auth) — deliberately never touches Clerk, so public
  // results stay available regardless of Clerk configuration/availability.
  app.use('/api/v1', publicRouter);

  // Admin surface: Clerk session context (scoped here only) then auth gate.
  const adminMiddleware = [];
  if (enableClerk) {
    // eslint-disable-next-line global-require
    const { clerkMiddleware } = require('@clerk/express');
    adminMiddleware.push(clerkMiddleware());
  }
  app.use('/api/v1/admin', ...adminMiddleware, requireAuth, adminRouter);

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
