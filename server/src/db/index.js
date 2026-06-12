'use strict';

const { Pool, types } = require('pg');

// Return DATE (OID 1082) as the raw 'YYYY-MM-DD' string rather than a JS Date
// at local midnight, which would shift the calendar day under some server
// timezones. race_date is a pure calendar date with no time/zone meaning.
types.setTypeParser(1082, (v) => v);

// The active connection pool. In dev/prod this is a real `pg` Pool built from
// DATABASE_URL. In tests, `configure()` swaps in a pg-mem-backed pool so the
// suite runs with no external Postgres.
let pool = null;

/** Inject a pool (used by the test harness to supply a pg-mem pool). */
function configure(customPool) {
  pool = customPool;
}

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set and no pool has been configured.');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

/** Run a parameterized query. */
function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Run `fn` inside a transaction, passing it a dedicated client. Commits on
 * success, rolls back on any thrown error.
 */
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface the original error
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Close the pool (used on shutdown and between test files). */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { configure, getPool, query, withTransaction, close };
