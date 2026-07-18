'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

/**
 * Build the Express app. Exported as a factory so tests can construct an
 * instance without starting a listener.
 *
 * (Auth is a shared-credential Basic-auth hack; Clerk is bypassed — see
 * middleware/auth.js. The unused opts arg is kept for call-site compatibility.)
 */
// eslint-disable-next-line no-unused-vars
function createApp(_opts = {}) {
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

  // Admin surface: shared-credential Basic auth (Clerk bypassed).
  app.use('/api/v1/admin', requireAuth, adminRouter);

  // In production the server also serves the built React client. This is a
  // single-process deploy; in dev the client runs as its own Vite process, so
  // this block is skipped entirely. Registered AFTER the API routes and BEFORE
  // the error handler so /api/v1/* and errorHandler keep working.
  if (process.env.NODE_ENV === 'production') {
    // Resolve relative to this file, not cwd — PM2 launches from a different
    // working directory. Build output lives at <repo>/client/dist.
    const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
    app.use(express.static(clientDist));

    // SPA catch-all: serve index.html for any non-API GET so client-side routes
    // (e.g. /admin/races/:id/results) deep-link on refresh. Express 5 uses
    // path-to-regexp v8, which rejects a bare '*' — use the named wildcard.
    app.get('/{*path}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
