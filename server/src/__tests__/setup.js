'use strict';

// Global Jest setup (runs once per test file). Ensure we are unambiguously in
// test mode so the auth middleware uses its test hook and never reaches Clerk.
process.env.NODE_ENV = 'test';
