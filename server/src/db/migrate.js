'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Split a .sql file into individual statements. Our migrations deliberately
 * contain no semicolons inside statements (no dollar-quoted bodies, no string
 * literals with semicolons), so a plain split is safe and works identically on
 * real Postgres and pg-mem.
 */
function splitStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.split('\n').every((line) => line.trim().startsWith('--')));
}

/**
 * Apply all pending migrations.
 *
 * @param {object} [customPool] - Pool to target (tests pass a pg-mem pool);
 *   otherwise the default pool from DATABASE_URL is used.
 * @param {object} [options]
 * @param {(sql: string) => string} [options.transformSql] - Optional rewrite
 *   applied to each migration file before execution. The pg-mem test harness
 *   uses this to strip precision/scale args (e.g. DECIMAL(6,2) -> DECIMAL)
 *   which pg-mem does not implement. Real Postgres runs the SQL verbatim.
 */
async function runMigrations(customPool, options = {}) {
  const { transformSql } = options;
  if (customPool) db.configure(customPool);

  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRes = await db.query('SELECT name FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map((r) => r.name));

  const newlyApplied = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    if (transformSql) sql = transformSql(sql);
    for (const statement of splitStatements(sql)) {
      await db.query(statement);
    }
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    newlyApplied.push(file);
  }
  return newlyApplied;
}

if (require.main === module) {
  runMigrations()
    .then((applied) => {
      if (applied.length) {
        console.log(`Applied migrations: ${applied.join(', ')}`);
      } else {
        console.log('No pending migrations.');
      }
      return db.close();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations, splitStatements };
