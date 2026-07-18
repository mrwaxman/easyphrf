'use strict';

const { createTestDb } = require('../../__tests__/helpers/testDb');
const db = require('../index');

describe('database schema (pg-mem)', () => {
  afterEach(async () => {
    await db.close();
  });

  test('migrations create all tables and seed the club', async () => {
    const { club } = await createTestDb();

    expect(club).toBeDefined();
    expect(club.slug).toBe('buccaneer');
    expect(club.name).toBe('Buccaneer Yacht Club');
    expect(club.timezone).toBe('America/Los_Angeles');
    // Defaults applied by the schema.
    expect(club.scoring_method).toBe('time_on_time');
    expect(club.spinnaker_mode).toBe('per_race');
    expect(club.club_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('UNIQUE (club_id, sail_number) is enforced on boats', async () => {
    const { club } = await createTestDb();
    const insert = () =>
      db.query(
        `INSERT INTO boats (club_id, sail_number, boat_name, skipper_name, phrf_base, phrf_spinnaker)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [club.club_id, 'USA 1', 'Boat', 'Skipper', 100, 90]
      );

    await insert();
    await expect(insert()).rejects.toThrow();
  });

  test('seed is idempotent', async () => {
    const { pool } = await createTestDb();
    const { seed } = require('../seed');
    await seed(pool);
    const res = await db.query('SELECT COUNT(*)::int AS n FROM clubs');
    expect(res.rows[0].n).toBe(1);
  });
});
