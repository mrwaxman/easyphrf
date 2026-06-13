'use strict';

const db = require('../db');
const { scoreSeriesStandings } = require('../scoring');
const { notFound } = require('../utils/errors');

/**
 * Build the race-result input for the scoring engine from the published races
 * of a series. Only published/revised races count toward standings.
 */
async function buildRaceResults(seriesId) {
  const racesRes = await db.query(
    `SELECT race_id, name, race_date, status
       FROM races
      WHERE series_id = $1 AND status IN ('published', 'revised')
      ORDER BY race_date, name`,
    [seriesId]
  );
  const races = racesRes.rows;

  const raceResults = [];
  for (const race of races) {
    const entriesRes = await db.query(
      `SELECT re.boat_id, re.fleet_id, re.finish_status, re.fleet_place, f.name AS fleet_name
         FROM race_entries re
         JOIN fleets f ON f.fleet_id = re.fleet_id
        WHERE re.race_id = $1`,
      [race.race_id]
    );
    const entries = entriesRes.rows;

    const fleetSize = new Map();
    for (const e of entries) {
      fleetSize.set(e.fleet_id, (fleetSize.get(e.fleet_id) || 0) + 1);
    }

    raceResults.push({
      raceId: race.race_id,
      raceDate: race.race_date,
      results: entries.map((e) => ({
        boatId: e.boat_id,
        fleetId: e.fleet_id,
        fleetName: e.fleet_name,
        finishStatus: e.finish_status,
        fleetPlace: e.fleet_place,
        fleetSize: fleetSize.get(e.fleet_id),
      })),
    });
  }

  return { races, raceResults };
}

/**
 * Compute series standings live (no persistence). Returns the series, its
 * counted races, and standings decorated with boat display fields + per-race
 * breakdown (for struck-through throwout columns in the UI).
 */
async function computeStandings(clubId, seriesId) {
  const seriesRes = await db.query(
    `SELECT * FROM series WHERE series_id = $1 AND club_id = $2`,
    [seriesId, clubId]
  );
  if (seriesRes.rows.length === 0) throw notFound('Series not found');
  const series = seriesRes.rows[0];

  const { races, raceResults } = await buildRaceResults(seriesId);
  const standings = scoreSeriesStandings(series, raceResults);

  // Join boat display fields.
  const boatsRes = await db.query(
    `SELECT boat_id, boat_name, sail_number, skipper_name FROM boats WHERE club_id = $1`,
    [clubId]
  );
  const boatById = new Map(boatsRes.rows.map((b) => [b.boat_id, b]));

  const decorated = standings.map((s) => ({
    ...s,
    boat: boatById.get(s.boatId) || null,
  }));

  // Group by fleet name (stable insertion order = the order boats first appear in that fleet).
  const fleetMap = new Map();
  for (const s of decorated) {
    const key = s.fleetName || 'Fleet';
    if (!fleetMap.has(key)) fleetMap.set(key, []);
    fleetMap.get(key).push(s);
  }
  const fleetStandings = [...fleetMap.entries()].map(([fleetName, standings]) => ({
    fleetName,
    standings,
  }));

  return { series, races, standings: decorated, fleetStandings };
}

/**
 * Recalculate and persist standings into series_standings, then return them.
 */
async function recalculateAndSave(clubId, seriesId) {
  const computed = await computeStandings(clubId, seriesId);

  await db.withTransaction(async (client) => {
    await client.query('DELETE FROM series_standings WHERE series_id = $1', [seriesId]);
    for (const s of computed.standings) {
      await client.query(
        `INSERT INTO series_standings
           (series_id, boat_id, fleet_id, total_points, races_sailed, throwouts, rank)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          seriesId,
          s.boatId,
          s.fleetId,
          s.total_points,
          s.races_sailed,
          JSON.stringify(s.throwouts),
          s.rank,
        ]
      );
    }
  });

  return computed;
}

module.exports = { buildRaceResults, computeStandings, recalculateAndSave };
