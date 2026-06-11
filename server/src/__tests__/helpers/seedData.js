'use strict';

const db = require('../../db');
const { scoreAndSave } = require('../../services/scoringService');

const START = new Date('2026-05-01T18:00:00Z');

/** Insert a boat for a club. */
async function createBoat(clubId, overrides = {}) {
  const b = {
    sail_number: 'USA 1',
    boat_name: 'Boat',
    skipper_name: 'Skipper',
    model: null,
    phrf_base: 100,
    phrf_spinnaker: 85,
    rating_source: 'official',
    ...overrides,
  };
  const res = await db.query(
    `INSERT INTO boats (club_id, sail_number, boat_name, model, skipper_name, phrf_base, phrf_spinnaker, rating_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [clubId, b.sail_number, b.boat_name, b.model, b.skipper_name, b.phrf_base, b.phrf_spinnaker, b.rating_source]
  );
  return res.rows[0];
}

/**
 * Create a fully-scored simultaneous-start race with 3 finishers in one PHRF
 * fleet. Optionally publish it. Returns ids and boats for assertions.
 */
async function createScoredRace(
  clubId,
  { publish = true, name = 'Spring #1', seriesId = null, sailPrefix = '' } = {}
) {
  const race = (
    await db.query(
      `INSERT INTO races (club_id, series_id, name, race_date, start_type, status, start_time)
       VALUES ($1, $2, $3, '2026-05-01', 'simultaneous', 'draft', $4) RETURNING *`,
      [clubId, seriesId, name, START]
    )
  ).rows[0];

  const fleet = (
    await db.query(
      `INSERT INTO fleets (race_id, name, fleet_type, uses_spinnaker)
       VALUES ($1, 'PHRF A', 'phrf', 'optional') RETURNING *`,
      [race.race_id]
    )
  ).rows[0];

  const specs = [
    { sail: `USA ${sailPrefix}1`, name: 'Alpha', skip: 'Anna', phrf: 90, elapsed: 3600 },
    { sail: `USA ${sailPrefix}2`, name: 'Bravo', skip: 'Ben', phrf: 120, elapsed: 3700, source: 'inferred' },
    { sail: `USA ${sailPrefix}3`, name: 'Charlie', skip: 'Cara', phrf: 150, elapsed: 3800 },
  ];

  const boats = [];
  for (const s of specs) {
    const boat = await createBoat(clubId, {
      sail_number: s.sail,
      boat_name: s.name,
      skipper_name: s.skip,
      phrf_base: s.phrf,
      phrf_spinnaker: s.phrf - 15,
      rating_source: s.source || 'official',
    });
    boats.push(boat);
    await db.query(
      `INSERT INTO race_entries (race_id, fleet_id, boat_id, finish_time, finish_status)
       VALUES ($1, $2, $3, $4, 'finished')`,
      [race.race_id, fleet.fleet_id, boat.boat_id, new Date(START.getTime() + s.elapsed * 1000)]
    );
  }

  await scoreAndSave(clubId, race.race_id);
  if (publish) {
    await db.query(`UPDATE races SET status = 'published', published_at = NOW() WHERE race_id = $1`, [
      race.race_id,
    ]);
  }

  return { race, fleet, boats };
}

module.exports = { createBoat, createScoredRace, START };
