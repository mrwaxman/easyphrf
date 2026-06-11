'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const db = require('../db');
const { createTestDb } = require('./helpers/testDb');
const { createScoredRace, createBoat } = require('./helpers/seedData');

const app = createApp({ enableClerk: false });
const ADMIN = { 'X-Test-Auth': 'admin-user', 'X-Club-Slug': 'demo' };

let club;
beforeEach(async () => {
  ({ club } = await createTestDb());
});
afterEach(async () => {
  await db.close();
});

describe('public endpoints', () => {
  test('GET /clubs/:slug returns club info', async () => {
    const res = await request(app).get('/api/v1/clubs/demo');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'demo', name: 'Demo Sailing Club' });
  });

  test('GET /clubs/:slug returns 404 for unknown slug', async () => {
    const res = await request(app).get('/api/v1/clubs/nope');
    expect(res.status).toBe(404);
  });

  test('GET /clubs/:slug/races returns only published races', async () => {
    await createScoredRace(club.club_id, { publish: true, name: 'Published Race', sailPrefix: 'P' });
    await createScoredRace(club.club_id, { publish: false, name: 'Draft Race', sailPrefix: 'D' });

    const res = await request(app).get('/api/v1/clubs/demo/races');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Published Race');
    expect(res.body[0].fleets[0].name).toBe('PHRF A');
  });

  test('GET /clubs/:slug/races/:id returns detail with scored results', async () => {
    const { race } = await createScoredRace(club.club_id);
    const res = await request(app).get(`/api/v1/clubs/demo/races/${race.race_id}`);
    expect(res.status).toBe(200);
    expect(res.body.fleets).toHaveLength(1);
    const entries = res.body.fleets[0].entries;
    expect(entries).toHaveLength(3);
    // Slowest-rated boat (Charlie, PHRF 150) wins on corrected time.
    expect(entries[0].boat_name).toBe('Charlie');
    expect(entries[0].fleet_place).toBe(1);
    expect(entries[0].corrected_seconds).toBeGreaterThan(0);
    // Inferred boat flagged.
    expect(entries.find((e) => e.boat_name === 'Bravo').inferred).toBe(true);
  });

  test('unpublished race is not visible on the public detail endpoint', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: false });
    const res = await request(app).get(`/api/v1/clubs/demo/races/${race.race_id}`);
    expect(res.status).toBe(404);
  });

  test('GET /clubs/:slug/series returns active series', async () => {
    await db.query(
      `INSERT INTO series (club_id, name, season_year) VALUES ($1, 'Summer Series', 2026)`,
      [club.club_id]
    );
    const res = await request(app).get('/api/v1/clubs/demo/series');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Summer Series');
  });
});

describe('admin auth', () => {
  test('unauthenticated admin request returns 401', async () => {
    const res = await request(app).get('/api/v1/admin/boats').set('X-Club-Slug', 'demo');
    expect(res.status).toBe(401);
  });

  test('missing club context returns 400', async () => {
    const res = await request(app).get('/api/v1/admin/boats').set('X-Test-Auth', 'admin-user');
    expect(res.status).toBe(400);
  });
});

describe('admin boats', () => {
  test('POST creates a boat and returns it', async () => {
    const res = await request(app)
      .post('/api/v1/admin/boats')
      .set(ADMIN)
      .send({ sail_number: 'USA 99', boat_name: 'Test', skipper_name: 'Tester', phrf_base: 100, phrf_spinnaker: 85 });
    expect(res.status).toBe(201);
    expect(res.body.boat_id).toBeDefined();
    expect(res.body.rating_source).toBe('official');
  });

  test('POST with missing fields returns 400', async () => {
    const res = await request(app).post('/api/v1/admin/boats').set(ADMIN).send({ boat_name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.details.missing).toContain('sail_number');
  });

  test('PUT updates a boat', async () => {
    const boat = await createBoat(club.club_id, { sail_number: 'USA 7' });
    const res = await request(app)
      .put(`/api/v1/admin/boats/${boat.boat_id}`)
      .set(ADMIN)
      .send({ phrf_base: 111, rating_notes: 'measured' });
    expect(res.status).toBe(200);
    expect(res.body.phrf_base).toBe(111);
    expect(res.body.rating_notes).toBe('measured');
  });

  test('DELETE soft-deletes (deactivates) a boat', async () => {
    const boat = await createBoat(club.club_id, { sail_number: 'USA 8' });
    const res = await request(app).delete(`/api/v1/admin/boats/${boat.boat_id}`).set(ADMIN);
    expect(res.status).toBe(200);
    const check = await db.query('SELECT active FROM boats WHERE boat_id = $1', [boat.boat_id]);
    expect(check.rows[0].active).toBe(false);
  });
});

describe('admin races: score / publish / revise', () => {
  test('POST /score returns scored entries with corrected times', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: false });
    const res = await request(app).post(`/api/v1/admin/races/${race.race_id}/score`).set(ADMIN);
    expect(res.status).toBe(200);
    const entries = res.body.fleets[0].entries;
    expect(entries.every((e) => e.corrected_seconds > 0)).toBe(true);
    expect(entries[0].fleet_place).toBe(1);
  });

  test('POST /publish sets status to published', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: false });
    const res = await request(app).post(`/api/v1/admin/races/${race.race_id}/publish`).set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
    expect(res.body.published_at).toBeTruthy();
  });

  test('POST /revise requires revision_notes and sets revised state', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: true });

    const missing = await request(app).post(`/api/v1/admin/races/${race.race_id}/revise`).set(ADMIN).send({});
    expect(missing.status).toBe(400);

    const ok = await request(app)
      .post(`/api/v1/admin/races/${race.race_id}/revise`)
      .set(ADMIN)
      .send({ revision_notes: 'Corrected Bravo finish time' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('revised');
    expect(ok.body.revision_notes).toBe('Corrected Bravo finish time');
    expect(ok.body.revised_at).toBeTruthy();
  });

  test('DELETE only removes draft races', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: true });
    const blocked = await request(app).delete(`/api/v1/admin/races/${race.race_id}`).set(ADMIN);
    expect(blocked.status).toBe(400);
  });
});

describe('admin series recalculate', () => {
  test('recalculate produces standings across published races', async () => {
    const series = (
      await db.query(
        `INSERT INTO series (club_id, name, season_year) VALUES ($1, 'S', 2026) RETURNING *`,
        [club.club_id]
      )
    ).rows[0];
    await createScoredRace(club.club_id, { publish: true, name: 'R1', seriesId: series.series_id });

    const res = await request(app)
      .post(`/api/v1/admin/series/${series.series_id}/recalculate`)
      .set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.standings).toHaveLength(3);
    expect(res.body.standings[0].rank).toBe(1);
    expect(res.body.standings[0].total_points).toBe(1); // race winner
  });
});

describe('pursuit start sheet', () => {
  test('GET /startsheet returns ordered start times for a pursuit race', async () => {
    const race = (
      await db.query(
        `INSERT INTO races (club_id, name, race_date, start_type, status, start_time)
         VALUES ($1, 'Pursuit', '2026-06-01', 'pursuit', 'draft', $2) RETURNING *`,
        [club.club_id, new Date('2026-06-01T18:00:00Z')]
      )
    ).rows[0];
    const fleet = (
      await db.query(
        `INSERT INTO fleets (race_id, name, fleet_type) VALUES ($1, 'P', 'phrf') RETURNING *`,
        [race.race_id]
      )
    ).rows[0];
    for (const [sail, phrf] of [['USA 10', 60], ['USA 11', 150]]) {
      const boat = await createBoat(club.club_id, { sail_number: sail, phrf_base: phrf, phrf_spinnaker: phrf });
      await db.query(`INSERT INTO race_entries (race_id, fleet_id, boat_id) VALUES ($1,$2,$3)`, [
        race.race_id,
        fleet.fleet_id,
        boat.boat_id,
      ]);
    }

    const res = await request(app).get(`/api/v1/admin/races/${race.race_id}/startsheet`).set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.starts).toHaveLength(2);
    // Slowest (PHRF 150) starts first at interval 0; faster boat starts later.
    expect(res.body.starts[0].intervalSeconds).toBe(0);
    expect(res.body.starts[1].intervalSeconds).toBeGreaterThan(0);
  });
});
