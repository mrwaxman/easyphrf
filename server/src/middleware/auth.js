'use strict';

const { unauthorized } = require('../utils/errors');

/**
 * Require an authenticated admin.
 *
 * In production this reads the Clerk session established by clerkMiddleware()
 * (mounted in app.js). In tests we never reach Clerk: an `X-Test-Auth` header
 * simulates a signed-in user, and its absence yields 401 — letting the suite
 * exercise both the authorized and unauthorized paths deterministically.
 */
function requireAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    const testUser = req.headers['x-test-auth'];
    if (testUser) {
      req.auth = { userId: String(testUser) };
      return next();
    }
    return next(unauthorized());
  }

  // Lazily require so tests never load Clerk.
  const { getAuth } = require('@clerk/express');
  const auth = getAuth(req);
  if (!auth || !auth.userId) {
    return next(unauthorized());
  }
  req.auth = { userId: auth.userId };
  return next();
}

module.exports = { requireAuth };
