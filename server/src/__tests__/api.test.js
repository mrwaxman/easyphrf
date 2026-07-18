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
    const res = await request(app).get('/api/v1/clubs/buccaneer');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'buccaneer', name: 'Buccaneer Yacht Club' });
  });

  // PHASE 2 MULTI-TENANT (restore later): in single-tenant mode the slug is
  // ignored and every request resolves the one configured club, so an "unknown
  // slug" no longer 404s. Re-enable when multi-club resolution returns.
  // test('GET /clubs/:slug returns 404 for unknown slug', async () => {
  //   const res = await request(app).get('/api/v1/clubs/nope');
  //   expect(res.status).toBe(404);
  // });

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

  // PHASE 2 MULTI-TENANT (restore later): single-tenant mode always resolves the
  // one configured club, so a request without club context no longer 400s.
  // test('missing club context returns 400', async () => {
  //   const res = await request(app).get('/api/v1/admin/boats').set('X-Test-Auth', 'admin-user');
  //   expect(res.status).toBe(400);
  // });
});

describe('admin boats', () => {
  test('POST creates a boat and computes phrf_spinnaker = base + offset', async () => {
    const res = await request(app)
      .post('/api/v1/admin/boats')
      .set(ADMIN)
      .send({ sail_number: 'USA 99', boat_name: 'Test', skipper_name: 'Tester', phrf_base: 100, spinnaker_offset: 5 });
    expect(res.status).toBe(201);
    expect(res.body.boat_id).toBeDefined();
    expect(res.body.rating_source).toBe('official');
    expect(res.body.phrf_base).toBe(100);
    expect(res.body.spinnaker_offset).toBe(5);
    expect(res.body.phrf_spinnaker).toBe(105);
  });

  test('POST defaults spinnaker_offset to 0 so phrf_spinnaker equals base', async () => {
    const res = await request(app)
      .post('/api/v1/admin/boats')
      .set(ADMIN)
      .send({ sail_number: 'USA 98', boat_name: 'NoOffset', skipper_name: 'Tester', phrf_base: 120 });
    expect(res.status).toBe(201);
    expect(res.body.spinnaker_offset).toBe(0);
    expect(res.body.phrf_spinnaker).toBe(120);
  });

  test('POST ignores a user-supplied phrf_spinnaker and computes it instead', async () => {
    const res = await request(app)
      .post('/api/v1/admin/boats')
      .set(ADMIN)
      .send({
        sail_number: 'USA 97',
        boat_name: 'Sneaky',
        skipper_name: 'Tester',
        phrf_base: 100,
        spinnaker_offset: 6,
        phrf_spinnaker: 999,
      });
    expect(res.status).toBe(201);
    expect(res.body.phrf_spinnaker).toBe(106);
  });

  test('POST with missing fields returns 400', async () => {
    const res = await request(app).post('/api/v1/admin/boats').set(ADMIN).send({ boat_name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.details.missing).toContain('sail_number');
  });

  test('PUT updates phrf_base and recomputes phrf_spinnaker', async () => {
    const boat = await createBoat(club.club_id, { sail_number: 'USA 7' });
    const res = await request(app)
      .put(`/api/v1/admin/boats/${boat.boat_id}`)
      .set(ADMIN)
      .send({ phrf_base: 111, rating_notes: 'measured' });
    expect(res.status).toBe(200);
    expect(res.body.phrf_base).toBe(111);
    // boat was seeded with spinnaker_offset 0, so phrf_spinnaker tracks base.
    expect(res.body.phrf_spinnaker).toBe(111);
    expect(res.body.rating_notes).toBe('measured');
  });

  test('PUT updating spinnaker_offset alone recomputes phrf_spinnaker from stored base', async () => {
    const boat = await createBoat(club.club_id, { sail_number: 'USA 6', phrf_base: 100 });
    const res = await request(app)
      .put(`/api/v1/admin/boats/${boat.boat_id}`)
      .set(ADMIN)
      .send({ spinnaker_offset: 8 });
    expect(res.status).toBe(200);
    expect(res.body.spinnaker_offset).toBe(8);
    expect(res.body.phrf_spinnaker).toBe(108);
  });

  test('PUT ignores a user-supplied phrf_spinnaker', async () => {
    const boat = await createBoat(club.club_id, { sail_number: 'USA 5', phrf_base: 100 });
    const res = await request(app)
      .put(`/api/v1/admin/boats/${boat.boat_id}`)
      .set(ADMIN)
      .send({ spinnaker_offset: 4, phrf_spinnaker: 999 });
    expect(res.status).toBe(200);
    expect(res.body.phrf_spinnaker).toBe(104);
  });

  test('DELETE soft-deletes (deactivates) a boat', async () => {
    const boat = await createBoat(club.club_id, { sail_number: 'USA 8' });
    const res = await request(app).delete(`/api/v1/admin/boats/${boat.boat_id}`).set(ADMIN);
    expect(res.status).toBe(200);
    const check = await db.query('SELECT active FROM boats WHERE boat_id = $1', [boat.boat_id]);
    expect(check.rows[0].active).toBe(false);
  });
});

describe('admin races: setup + default fleet', () => {
  const NEW_RACE = { name: 'Club Race', race_date: '2026-07-01', start_type: 'simultaneous' };

  test('POST with no fleets auto-creates a single combined default fleet', async () => {
    const created = await request(app).post('/api/v1/admin/races').set(ADMIN).send(NEW_RACE);
    expect(created.status).toBe(201);

    const detail = await request(app).get(`/api/v1/admin/races/${created.body.race_id}`).set(ADMIN);
    expect(detail.status).toBe(200);
    expect(detail.body.fleets).toHaveLength(1);
    expect(detail.body.fleets[0]).toMatchObject({
      name: 'Fleet',
      fleet_type: 'phrf',
      phrf_min: null,
      phrf_max: null,
      uses_spinnaker: 'optional',
    });
  });

  test('the race can be created and advanced without any explicit fleet setup', async () => {
    // No fleet is required to save the race — the default makes scoring possible.
    const created = await request(app).post('/api/v1/admin/races').set(ADMIN).send(NEW_RACE);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('draft');
  });

  test('PUT does not add a second default to a race that already has the default', async () => {
    const created = await request(app).post('/api/v1/admin/races').set(ADMIN).send(NEW_RACE);
    const raceId = created.body.race_id;

    const updated = await request(app)
      .put(`/api/v1/admin/races/${raceId}`)
      .set(ADMIN)
      .send({ name: 'Club Race (renamed)' });
    expect(updated.status).toBe(200);

    const detail = await request(app).get(`/api/v1/admin/races/${raceId}`).set(ADMIN);
    expect(detail.body.fleets).toHaveLength(1);
  });

  test('an explicit fleet replaces the need for a default — save adds none', async () => {
    const created = await request(app).post('/api/v1/admin/races').set(ADMIN).send(NEW_RACE);
    const raceId = created.body.race_id;

    // Admin adds a real fleet, then removes the auto-default.
    const defaultFleetId = (await request(app).get(`/api/v1/admin/races/${raceId}`).set(ADMIN)).body
      .fleets[0].fleet_id;
    const real = await request(app)
      .post(`/api/v1/admin/races/${raceId}/fleets`)
      .set(ADMIN)
      .send({ name: 'PHRF A', fleet_type: 'phrf' });
    expect(real.status).toBe(201);
    await request(app).delete(`/api/v1/admin/races/${raceId}/fleets/${defaultFleetId}`).set(ADMIN);

    // Saving again must not re-introduce the default — a real fleet exists.
    await request(app).put(`/api/v1/admin/races/${raceId}`).set(ADMIN).send({ name: 'AB Race' });

    const detail = await request(app).get(`/api/v1/admin/races/${raceId}`).set(ADMIN);
    expect(detail.body.fleets).toHaveLength(1);
    expect(detail.body.fleets[0].name).toBe('PHRF A');
  });

  test('PUT on a race with an existing explicit fleet adds no default', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: false });
    const updated = await request(app)
      .put(`/api/v1/admin/races/${race.race_id}`)
      .set(ADMIN)
      .send({ name: 'Spring #1 (edited)' });
    expect(updated.status).toBe(200);

    const detail = await request(app).get(`/api/v1/admin/races/${race.race_id}`).set(ADMIN);
    expect(detail.body.fleets).toHaveLength(1);
    expect(detail.body.fleets[0].name).toBe('PHRF A');
  });
});

describe('admin races: scheduled start time (club timezone)', () => {
  // The demo club is seeded in America/Los_Angeles.
  test('POST stores start_time from a local time of day in the club tz', async () => {
    const res = await request(app)
      .post('/api/v1/admin/races')
      .set(ADMIN)
      .send({ name: 'Evening', race_date: '2026-07-01', start_type: 'simultaneous', start_time_of_day: '18:00' });
    expect(res.status).toBe(201);
    // 18:00 PDT on 2026-07-01 == 01:00 UTC on 2026-07-02.
    expect(new Date(res.body.start_time).toISOString()).toBe('2026-07-02T01:00:00.000Z');

    const detail = await request(app).get(`/api/v1/admin/races/${res.body.race_id}`).set(ADMIN);
    expect(detail.body.start_time_of_day).toBe('18:00:00');
    expect(detail.body.timezone).toBe('America/Los_Angeles');
  });

  test('PUT updates start_time from a time of day, reusing the stored race_date', async () => {
    const created = await request(app)
      .post('/api/v1/admin/races')
      .set(ADMIN)
      .send({ name: 'Pursuit', race_date: '2026-07-01', start_type: 'pursuit' });
    const raceId = created.body.race_id;
    expect(created.body.start_time).toBeNull();

    const updated = await request(app)
      .put(`/api/v1/admin/races/${raceId}`)
      .set(ADMIN)
      .send({ start_time_of_day: '10:30' });
    expect(updated.status).toBe(200);
    expect(new Date(updated.body.start_time).toISOString()).toBe('2026-07-01T17:30:00.000Z');
  });

  test('self_timed races ignore a submitted start time', async () => {
    const res = await request(app)
      .post('/api/v1/admin/races')
      .set(ADMIN)
      .send({
        name: 'Frostbite',
        race_date: '2026-07-01',
        start_type: 'self_timed',
        self_timed_mode: 'fully_independent',
        start_time_of_day: '18:00',
      });
    expect(res.status).toBe(201);
    expect(res.body.start_time).toBeNull();
  });
});

describe('pursuit start sheet without a start time', () => {
  async function pursuitWithEntries() {
    const race = (
      await request(app)
        .post('/api/v1/admin/races')
        .set(ADMIN)
        .send({ name: 'Pursuit', race_date: '2026-07-01', start_type: 'pursuit' })
    ).body;
    const fleetId = (await request(app).get(`/api/v1/admin/races/${race.race_id}`).set(ADMIN)).body
      .fleets[0].fleet_id;
    for (const [sail, phrf] of [['USA 20', 60], ['USA 21', 150]]) {
      const boat = await createBoat(club.club_id, { sail_number: sail, phrf_base: phrf });
      await request(app)
        .post(`/api/v1/admin/races/${race.race_id}/entries`)
        .set(ADMIN)
        .send({ fleet_id: fleetId, boat_id: boat.boat_id });
    }
    return race;
  }

  test('reports needs_start_time instead of throwing a dead-end error', async () => {
    const race = await pursuitWithEntries();
    const res = await request(app).get(`/api/v1/admin/races/${race.race_id}/startsheet`).set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.needs_start_time).toBe(true);
    expect(res.body.race_date).toBe('2026-07-01');
    expect(res.body.timezone).toBe('America/Los_Angeles');
  });

  test('generates the sheet once a start time is set via the API', async () => {
    const race = await pursuitWithEntries();
    await request(app)
      .put(`/api/v1/admin/races/${race.race_id}`)
      .set(ADMIN)
      .send({ start_time_of_day: '11:00' });

    const res = await request(app).get(`/api/v1/admin/races/${race.race_id}/startsheet`).set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.needs_start_time).toBeUndefined();
    expect(res.body.starts).toHaveLength(2);
    expect(res.body.starts[0].intervalSeconds).toBe(0);
  });
});

describe('simultaneous results use the scheduled start time', () => {
  test('elapsed = finish - start, both interpreted in the club tz', async () => {
    const race = (
      await request(app)
        .post('/api/v1/admin/races')
        .set(ADMIN)
        .send({ name: 'Simul', race_date: '2026-07-01', start_type: 'simultaneous', start_time_of_day: '18:00' })
    ).body;
    const fleetId = (await request(app).get(`/api/v1/admin/races/${race.race_id}`).set(ADMIN)).body
      .fleets[0].fleet_id;
    const boat = await createBoat(club.club_id, { sail_number: 'USA 30', phrf_base: 100 });
    const entry = (
      await request(app)
        .post(`/api/v1/admin/races/${race.race_id}/entries`)
        .set(ADMIN)
        .send({ fleet_id: fleetId, boat_id: boat.boat_id })
    ).body;

    // Finish entered as a club-local wall clock 90 minutes after the gun.
    await request(app)
      .put(`/api/v1/admin/races/${race.race_id}/entries/${entry.entry_id}`)
      .set(ADMIN)
      .send({ finish_time: '2026-07-01T19:30', finish_status: 'finished' });

    const scored = await request(app).post(`/api/v1/admin/races/${race.race_id}/score`).set(ADMIN);
    expect(scored.status).toBe(200);
    const scoredEntry = scored.body.fleets[0].entries[0];
    expect(scoredEntry.elapsed_seconds).toBe(90 * 60);
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

  test('DELETE removes any race regardless of status', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: true });
    const res = await request(app).delete(`/api/v1/admin/races/${race.race_id}`).set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });
});

describe('admin series CRUD', () => {
  test('POST without throwout or min fields uses defaults', async () => {
    const res = await request(app)
      .post('/api/v1/admin/series')
      .set(ADMIN)
      .send({ name: 'Defaults', season_year: 2026 });
    expect(res.status).toBe(201);
    expect(res.body.throwouts_enabled).toBe(false);
    expect(res.body.throwout_tiers).toEqual([]);
    expect(res.body.min_races_to_qualify).toBeNull();
  });

  test('POST with throwouts_enabled=true and tiers stores them', async () => {
    const tiers = [{ after_races: 4, throwouts: 1 }];
    const res = await request(app)
      .post('/api/v1/admin/series')
      .set(ADMIN)
      .send({ name: 'With Throwouts', season_year: 2026, throwouts_enabled: true, throwout_tiers: tiers });
    expect(res.status).toBe(201);
    expect(res.body.throwouts_enabled).toBe(true);
    expect(res.body.throwout_tiers).toEqual(tiers);
  });

  test('POST with min_races_to_qualify stores the value', async () => {
    const res = await request(app)
      .post('/api/v1/admin/series')
      .set(ADMIN)
      .send({ name: 'Has Min', season_year: 2026, min_races_to_qualify: 3 });
    expect(res.status).toBe(201);
    expect(res.body.min_races_to_qualify).toBe(3);
  });
});

describe('admin series update', () => {
  test('PUT updates name, season_year, and min_races_to_qualify', async () => {
    const created = (
      await request(app).post('/api/v1/admin/series').set(ADMIN).send({ name: 'Old', season_year: 2025 })
    ).body;
    const res = await request(app)
      .put(`/api/v1/admin/series/${created.series_id}`)
      .set(ADMIN)
      .send({ name: 'New', season_year: 2027, min_races_to_qualify: 3 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
    expect(res.body.season_year).toBe(2027);
    expect(res.body.min_races_to_qualify).toBe(3);
  });

  test('PUT throwouts_enabled=false → recalculate drops nothing', async () => {
    const sRes = (
      await request(app).post('/api/v1/admin/series').set(ADMIN).send({
        name: 'TogOff',
        season_year: 2026,
        throwouts_enabled: true,
        throwout_tiers: [{ after_races: 1, throwouts: 1 }],
      })
    ).body;
    const sid = sRes.series_id;
    await createScoredRace(club.club_id, { publish: true, name: 'TO1', seriesId: sid, sailPrefix: 'TO' });

    // with throwouts ON, boats drop their only race → total = 0
    const r1 = (await request(app).post(`/api/v1/admin/series/${sid}/recalculate`).set(ADMIN)).body;
    expect(r1.standings.every((s) => s.throwouts.length === 1)).toBe(true);
    expect(r1.standings.every((s) => s.total_points === 0)).toBe(true);

    await request(app).put(`/api/v1/admin/series/${sid}`).set(ADMIN).send({ throwouts_enabled: false });

    // with throwouts OFF, all scores count
    const r2 = (await request(app).post(`/api/v1/admin/series/${sid}/recalculate`).set(ADMIN)).body;
    expect(r2.standings.every((s) => s.throwouts.length === 0)).toBe(true);
    expect(r2.standings.every((s) => s.total_points > 0)).toBe(true);
  });

  test('PUT throwouts_enabled=true with tier → recalculate applies throwout', async () => {
    const sRes = (
      await request(app).post('/api/v1/admin/series').set(ADMIN).send({ name: 'TurnOn', season_year: 2026 })
    ).body;
    const sid = sRes.series_id;
    await createScoredRace(club.club_id, { publish: true, name: 'TN1', seriesId: sid, sailPrefix: 'TN' });

    // throwouts OFF: no drops
    const r1 = (await request(app).post(`/api/v1/admin/series/${sid}/recalculate`).set(ADMIN)).body;
    expect(r1.standings.every((s) => s.throwouts.length === 0)).toBe(true);

    await request(app)
      .put(`/api/v1/admin/series/${sid}`)
      .set(ADMIN)
      .send({ throwouts_enabled: true, throwout_tiers: [{ after_races: 1, throwouts: 1 }] });

    // throwouts ON: boats drop their only race → total = 0
    const r2 = (await request(app).post(`/api/v1/admin/series/${sid}/recalculate`).set(ADMIN)).body;
    expect(r2.standings.every((s) => s.throwouts.length === 1)).toBe(true);
    expect(r2.standings.every((s) => s.total_points === 0)).toBe(true);
  });

  test('assigning a race to a series feeds standings; unassigning removes it', async () => {
    const sRes = (
      await request(app).post('/api/v1/admin/series').set(ADMIN).send({ name: 'Assign', season_year: 2026 })
    ).body;
    const sid = sRes.series_id;

    const r0 = (await request(app).post(`/api/v1/admin/series/${sid}/recalculate`).set(ADMIN)).body;
    expect(r0.standings).toHaveLength(0);

    const { race } = await createScoredRace(club.club_id, { publish: true, name: 'AR1', seriesId: null, sailPrefix: 'AR' });

    await request(app).put(`/api/v1/admin/races/${race.race_id}`).set(ADMIN).send({ series_id: sid });
    const r1 = (await request(app).post(`/api/v1/admin/series/${sid}/recalculate`).set(ADMIN)).body;
    expect(r1.standings).toHaveLength(3);

    await request(app).put(`/api/v1/admin/races/${race.race_id}`).set(ADMIN).send({ series_id: null });
    const r2 = (await request(app).post(`/api/v1/admin/series/${sid}/recalculate`).set(ADMIN)).body;
    expect(r2.standings).toHaveLength(0);
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

  test('recalculate with min_races_to_qualify=2 marks one-race boats unqualified', async () => {
    const series = (
      await db.query(
        `INSERT INTO series (club_id, name, season_year, min_races_to_qualify) VALUES ($1, 'MinTest', 2026, 2) RETURNING *`,
        [club.club_id]
      )
    ).rows[0];
    // One published race — each boat has raced exactly once, below the threshold of 2.
    await createScoredRace(club.club_id, { publish: true, name: 'R1', seriesId: series.series_id });

    const res = await request(app)
      .post(`/api/v1/admin/series/${series.series_id}/recalculate`)
      .set(ADMIN);
    expect(res.status).toBe(200);
    // All boats have 1 race < min 2, so none are ranked.
    expect(res.body.standings.every((s) => s.rank === null)).toBe(true);
    expect(res.body.standings.every((s) => s.qualified === false)).toBe(true);
  });
});

describe('per-fleet start times (simultaneous)', () => {
  test('race POST with start_time_of_day syncs the default fleet start_time', async () => {
    const res = await request(app).post('/api/v1/admin/races').set(ADMIN)
      .send({ name: 'SyncPost', race_date: '2026-07-01', start_type: 'simultaneous', start_time_of_day: '18:00' });
    expect(res.status).toBe(201);
    const detail = await request(app).get(`/api/v1/admin/races/${res.body.race_id}`).set(ADMIN);
    expect(detail.body.fleets[0].start_time_of_day).toBe('18:00:00');
  });

  test('race PUT with start_time_of_day syncs all fleet start_times', async () => {
    const raceRes = await request(app).post('/api/v1/admin/races').set(ADMIN)
      .send({ name: 'SyncPut', race_date: '2026-07-01', start_type: 'simultaneous', start_time_of_day: '18:00' });
    const raceId = raceRes.body.race_id;
    await request(app).post(`/api/v1/admin/races/${raceId}/fleets`).set(ADMIN)
      .send({ name: 'Fleet B', fleet_type: 'phrf' });

    await request(app).put(`/api/v1/admin/races/${raceId}`).set(ADMIN)
      .send({ start_time_of_day: '18:30', race_date: '2026-07-01' });

    const detail = await request(app).get(`/api/v1/admin/races/${raceId}`).set(ADMIN);
    for (const f of detail.body.fleets) {
      expect(f.start_time_of_day).toBe('18:30:00');
    }
  });

  test('fleet PUT with start_time_of_day sets only that fleet', async () => {
    const raceRes = await request(app).post('/api/v1/admin/races').set(ADMIN)
      .send({ name: 'SplitFleet', race_date: '2026-07-01', start_type: 'simultaneous', start_time_of_day: '18:00' });
    const raceId = raceRes.body.race_id;
    const fleetAId = (await request(app).get(`/api/v1/admin/races/${raceId}`).set(ADMIN)).body.fleets[0].fleet_id;

    const fleetBRes = await request(app).post(`/api/v1/admin/races/${raceId}/fleets`).set(ADMIN)
      .send({ name: 'Fleet B', fleet_type: 'phrf' });
    const fleetBId = fleetBRes.body.fleet_id;

    await request(app).put(`/api/v1/admin/races/${raceId}/fleets/${fleetBId}`).set(ADMIN)
      .send({ start_time_of_day: '18:10' });

    const detail = await request(app).get(`/api/v1/admin/races/${raceId}`).set(ADMIN);
    const fA = detail.body.fleets.find((f) => f.fleet_id === fleetAId);
    const fB = detail.body.fleets.find((f) => f.fleet_id === fleetBId);
    expect(fA.start_time_of_day).toBe('18:00:00'); // unchanged
    expect(fB.start_time_of_day).toBe('18:10:00'); // updated
  });

  test('scoring: each fleet elapsed measured from its own gun time', async () => {
    // Fleet A gun: 18:00 PDT (2026-07-02T01:00:00Z). Fleet B gun: 18:30 PDT (+30min).
    // Both boats finish at 19:30 PDT (2026-07-02T02:30:00Z).
    // Fleet A elapsed = 5400s (90min). Fleet B elapsed = 3600s (60min).
    const raceRes = await request(app).post('/api/v1/admin/races').set(ADMIN)
      .send({ name: 'FleetElapsed', race_date: '2026-07-01', start_type: 'simultaneous', start_time_of_day: '18:00' });
    const raceId = raceRes.body.race_id;
    const fleetAId = (await request(app).get(`/api/v1/admin/races/${raceId}`).set(ADMIN)).body.fleets[0].fleet_id;

    const fleetBRes = await request(app).post(`/api/v1/admin/races/${raceId}/fleets`).set(ADMIN)
      .send({ name: 'Fleet B', fleet_type: 'phrf' });
    const fleetBId = fleetBRes.body.fleet_id;
    await request(app).put(`/api/v1/admin/races/${raceId}/fleets/${fleetBId}`).set(ADMIN)
      .send({ start_time_of_day: '18:30' });

    const boatA = await createBoat(club.club_id, { sail_number: 'FE1', phrf_base: 90 });
    const boatB = await createBoat(club.club_id, { sail_number: 'FE2', phrf_base: 90 });
    const eARes = await request(app).post(`/api/v1/admin/races/${raceId}/entries`).set(ADMIN)
      .send({ fleet_id: fleetAId, boat_id: boatA.boat_id });
    const eBRes = await request(app).post(`/api/v1/admin/races/${raceId}/entries`).set(ADMIN)
      .send({ fleet_id: fleetBId, boat_id: boatB.boat_id });

    const finishUtc = '2026-07-02T02:30:00Z'; // 19:30 PDT — both boats finish together
    await request(app).put(`/api/v1/admin/races/${raceId}/entries/${eARes.body.entry_id}`).set(ADMIN)
      .send({ finish_time: finishUtc, finish_status: 'finished' });
    await request(app).put(`/api/v1/admin/races/${raceId}/entries/${eBRes.body.entry_id}`).set(ADMIN)
      .send({ finish_time: finishUtc, finish_status: 'finished' });

    const scored = await request(app).post(`/api/v1/admin/races/${raceId}/score`).set(ADMIN);
    expect(scored.status).toBe(200);
    const fA = scored.body.fleets.find((f) => f.fleet_id === fleetAId);
    const fB = scored.body.fleets.find((f) => f.fleet_id === fleetBId);
    expect(fA.entries[0].elapsed_seconds).toBe(5400); // 19:30 − 18:00 = 90 min
    expect(fB.entries[0].elapsed_seconds).toBe(3600); // 19:30 − 18:30 = 60 min
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
      const boat = await createBoat(club.club_id, { sail_number: sail, phrf_base: phrf });
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

  test('race_distance is used as the TOD factor: delay = PHRF_diff × distance', async () => {
    const race = (
      await db.query(
        `INSERT INTO races (club_id, name, race_date, start_type, status, start_time, race_distance)
         VALUES ($1, 'Pursuit TOD', '2026-06-01', 'pursuit', 'draft', $2, 6.4) RETURNING *`,
        [club.club_id, new Date('2026-06-01T18:00:00Z')]
      )
    ).rows[0];
    const fleet = (
      await db.query(
        `INSERT INTO fleets (race_id, name, fleet_type) VALUES ($1, 'P', 'phrf') RETURNING *`,
        [race.race_id]
      )
    ).rows[0];
    for (const [sail, phrf] of [['USA 20', 82], ['USA 21', 226]]) {
      const boat = await createBoat(club.club_id, { sail_number: sail, phrf_base: phrf });
      await db.query(`INSERT INTO race_entries (race_id, fleet_id, boat_id) VALUES ($1,$2,$3)`, [
        race.race_id, fleet.fleet_id, boat.boat_id,
      ]);
    }
    const res = await request(app).get(`/api/v1/admin/races/${race.race_id}/startsheet`).set(ADMIN);
    expect(res.status).toBe(200);
    // delay = (226 - 82) × 6.4 = 144 × 6.4 = 921.6 → rounded to 922 s
    const fast = res.body.starts.find((s) => s.phrf === 82);
    expect(fast.intervalSeconds).toBe(922);
  });
});
