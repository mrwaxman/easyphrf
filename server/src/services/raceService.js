'use strict';

const db = require('../db');
const { effectiveRating } = require('../scoring');
const { notFound } = require('../utils/errors');

/**
 * Load a race plus its fleets and entries (entries joined to boat data), scoped
 * to a club. Throws 404 if the race does not belong to the club. When
 * `publishedOnly` is set, only published/revised races are returned (public
 * surface).
 */
async function loadRace(clubId, raceId, { publishedOnly = false } = {}) {
  const raceRes = await db.query(
    `SELECT r.*, s.name AS series_name
       FROM races r
       LEFT JOIN series s ON r.series_id = s.series_id
      WHERE r.race_id = $1 AND r.club_id = $2`,
    [raceId, clubId]
  );
  if (raceRes.rows.length === 0) throw notFound('Race not found');
  const race = raceRes.rows[0];

  if (publishedOnly && !['published', 'revised'].includes(race.status)) {
    throw notFound('Race not found');
  }

  const fleetsRes = await db.query(
    `SELECT * FROM fleets WHERE race_id = $1 ORDER BY fleet_type, name`,
    [raceId]
  );
  const entriesRes = await db.query(
    `SELECT e.*, b.boat_name, b.sail_number, b.skipper_name, b.model,
            b.phrf_base, b.phrf_spinnaker, b.rating_source
       FROM race_entries e
       JOIN boats b ON e.boat_id = b.boat_id
      WHERE e.race_id = $1`,
    [raceId]
  );

  return { race, fleets: fleetsRes.rows, entries: entriesRes.rows };
}

/** Decorate a raw entry row with display-time computed fields. */
function decorateEntry(entry) {
  const boat = {
    phrf_base: entry.phrf_base,
    phrf_spinnaker: entry.phrf_spinnaker,
    rating_source: entry.rating_source,
  };
  return {
    ...entry,
    rating_used: effectiveRating(entry, boat),
    inferred: entry.rating_source === 'inferred',
    override_applied: entry.phrf_override !== null && entry.phrf_override !== undefined,
  };
}

const byPlace = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
};

/**
 * Assemble a display-ready race detail: fleets each with their (decorated,
 * place-sorted) entries, plus a combined overall PHRF standings list.
 */
function assembleRaceDetail({ race, fleets, entries }) {
  const decorated = entries.map(decorateEntry);

  const fleetsOut = fleets.map((fleet) => {
    const fleetEntries = decorated
      .filter((e) => e.fleet_id === fleet.fleet_id)
      .sort((a, b) => byPlace(a.fleet_place, b.fleet_place));
    return { ...fleet, entries: fleetEntries };
  });

  const phrfFleetCount = fleets.filter((f) => f.fleet_type === 'phrf').length;
  const overall =
    phrfFleetCount > 1
      ? decorated
          .filter((e) => {
            const fleet = fleets.find((f) => f.fleet_id === e.fleet_id);
            return fleet && fleet.fleet_type === 'phrf';
          })
          .slice()
          .sort((a, b) => byPlace(a.overall_place, b.overall_place))
      : [];

  return {
    ...race,
    fleets: fleetsOut,
    overall,
    has_multiple_phrf_fleets: phrfFleetCount > 1,
  };
}

/** Load a race row scoped to a club, or throw 404. Lightweight (no joins). */
async function ownedRace(clubId, raceId) {
  const res = await db.query('SELECT * FROM races WHERE race_id = $1 AND club_id = $2', [
    raceId,
    clubId,
  ]);
  if (res.rows.length === 0) throw notFound('Race not found');
  return res.rows[0];
}

module.exports = { loadRace, assembleRaceDetail, decorateEntry, ownedRace };
