'use strict';

const { newDb, DataType } = require('pg-mem');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { runMigrations } = require('../../db/migrate');
const { seed } = require('../../db/seed');

/**
 * Build a fresh in-memory Postgres (pg-mem), register the functions our schema
 * relies on, run migrations, optionally seed, and point the app's db module at
 * it. Returns the pg-mem instance and the pool for direct use in tests.
 */
async function createTestDb({ seed: doSeed = true } = {}) {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  // Postgres' gen_random_uuid() is not built into pg-mem; register it so column
  // defaults resolve. Marked impure so it is re-evaluated for every row.
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => uuidv4(),
    impure: true,
  });

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  db.configure(pool);

  // Adapt the schema to pg-mem's limitations (the in-memory test DB only;
  // real Postgres runs the migrations verbatim):
  //  - pg-mem does not implement NUMERIC/DECIMAL precision+scale args.
  //  - pg-mem evaluates `NULL IN (...)` as false, so a CHECK on a nullable
  //    column (e.g. races.self_timed_mode) wrongly rejects NULL rows. App-level
  //    ensureEnum() validation already guards these values, so drop the CHECKs.
  const transformSql = (sql) =>
    sql
      .replace(/\b(DECIMAL|NUMERIC)\s*\([^)]*\)/gi, '$1')
      .replace(/\bCHECK\s*\((?:[^()]|\([^()]*\))*\)/gi, '');

  await runMigrations(pool, { transformSql });
  let club = null;
  if (doSeed) {
    club = await seed(pool);
  }

  return { mem, pool, club };
}

module.exports = { createTestDb };
