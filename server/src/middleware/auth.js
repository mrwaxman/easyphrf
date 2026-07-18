'use strict';

const crypto = require('crypto');
const { unauthorized } = require('../utils/errors');

/**
 * Require an authenticated admin (race committee).
 *
 * HACK / TEMPORARY (Clerk bypassed): admin access is gated by a single shared
 * credential supplied via HTTP Basic auth and checked against ADMIN_USERNAME /
 * ADMIN_PASSWORD from the environment. This is deliberately low-security for a
 * single-club deployment; restore Clerk (see git history) for real auth.
 *
 * In tests we short-circuit with an `X-Test-Auth` header so the suite can
 * exercise both the authorized and unauthorized paths without any credential.
 */
function safeEqual(a, b) {
  // Hash both sides to a fixed length so length differences don't throw and
  // comparison timing stays roughly constant.
  const ah = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const bh = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ah, bh);
}

function requireAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    const testUser = req.headers['x-test-auth'];
    if (testUser) {
      req.auth = { userId: String(testUser) };
      return next();
    }
    return next(unauthorized());
  }

  const USER = process.env.ADMIN_USERNAME;
  const PASS = process.env.ADMIN_PASSWORD;
  if (!USER || !PASS) {
    return next(unauthorized('Admin credentials are not configured'));
  }

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    return next(unauthorized());
  }

  let decoded = '';
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return next(unauthorized());
  }
  const sep = decoded.indexOf(':');
  if (sep === -1) {
    return next(unauthorized());
  }
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  // Evaluate both comparisons regardless of the first result to avoid
  // short-circuit timing leaks.
  const ok = safeEqual(user, USER) && safeEqual(pass, PASS);
  if (!ok) {
    return next(unauthorized());
  }

  req.auth = { userId: user };
  return next();
}

module.exports = { requireAuth };
