'use strict';

const db = require('../db');
const { scoreRace } = require('../scoring');
const { loadRace } = require('./raceService');

/**
 * Points earned within a single race: finish place for finishers, otherwise the
 * fleet size + 1 (mirrors the series-scoring penalty so standings stay
 * consistent with stored per-race points).
 */
function racePointsFor(entry, fleetSize) {
  return entry.finish_status === 'finished' ? entry.fleet_place : fleetSize + 1;
}

/**
 * Score a race and persist elapsed/corrected times, fleet & overall places, and
 * per-race points back onto its entries. Returns the scored entries.
 */
async function scoreAndSave(clubId, raceId) {
  const { race, fleets, entries } = await loadRace(clubId, raceId);

  // Attach fleet_type so the scoring engine can branch PHRF vs one-design.
  const fleetTypeById = new Map(fleets.map((f) => [f.fleet_id, f.fleet_type]));
  const enrichedEntries = entries.map((e) => ({
    ...e,
    fleet_type: fleetTypeById.get(e.fleet_id),
  }));
  const boats = entries.map((e) => ({
    boat_id: e.boat_id,
    phrf_base: e.phrf_base,
    phrf_spinnaker: e.phrf_spinnaker,
    rating_source: e.rating_source,
  }));

  const scored = scoreRace(race, enrichedEntries, boats);

  // Fleet sizes for points.
  const fleetSize = new Map();
  for (const e of scored) {
    fleetSize.set(e.fleet_id, (fleetSize.get(e.fleet_id) || 0) + 1);
  }

  await db.withTransaction(async (client) => {
    for (const e of scored) {
      const points = racePointsFor(e, fleetSize.get(e.fleet_id));
      await client.query(
        `UPDATE race_entries
            SET elapsed_seconds = $1, corrected_seconds = $2,
                fleet_place = $3, overall_place = $4, points = $5
          WHERE entry_id = $6`,
        [e.elapsed_seconds, e.corrected_seconds, e.fleet_place, e.overall_place, points, e.entry_id]
      );
    }
  });

  return scored;
}

module.exports = { scoreAndSave, racePointsFor };
