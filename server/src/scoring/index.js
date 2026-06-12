'use strict';

/**
 * EasyPHRF scoring engine.
 *
 * Pure functions only — no database or I/O. This is the most heavily tested
 * module in the system; keep it that way.
 *
 * Two notes where this implementation follows the *formulas* in the spec over
 * prose bullets that contradict them:
 *
 *  1. Time-on-Time direction. corrected = elapsed * 650 / (650 + phrf). For a
 *     FIXED elapsed time, a HIGHER PHRF yields a LOWER (better) corrected time.
 *     That is the correct PHRF semantics: if a slow-rated and a fast-rated boat
 *     post the same elapsed time, the slow-rated (higher PHRF) boat performed
 *     better and should win. (The spec's prose bullet stating the opposite is
 *     reversed; the formula is canonical and authoritative.)
 *
 *  2. Pursuit-start sign. The reference boat is the slowest (highest PHRF) and
 *     starts first; the fastest boat (lowest PHRF) starts last. That requires a
 *     non-negative delay of (referencePHRF - theirPHRF) * factor, not the
 *     literal (theirPHRF - referencePHRF) which would be negative for every
 *     non-reference boat. We implement the sign that satisfies both stated
 *     ordering rules.
 */

const {
  TOT_BASE,
  DEFAULT_PURSUIT_RACE_SECONDS,
  FINISHED,
} = require('@easyphrf/shared');

// --- 2a. PHRF Time-on-Time ---------------------------------------------------

/**
 * Corrected time in seconds for a Time-on-Time race.
 * corrected = elapsed * 650 / (650 + phrf)
 */
function correctTimeToT(elapsedSeconds, phrfRating) {
  return (elapsedSeconds * TOT_BASE) / (TOT_BASE + phrfRating);
}

// --- 2b. Effective PHRF rating ----------------------------------------------

/**
 * The rating to use for an entry: an explicit override wins; otherwise the
 * boat's base (spinnaker) rating when flying a kite, else its non-spin rating.
 *
 * Per the rating convention, phrf_base is the faster spinnaker rating and
 * phrf_spinnaker (= phrf_base + spinnaker_offset) is the slower non-spinnaker
 * rating. So a boat flying a kite is scored on phrf_base, and one without on
 * phrf_spinnaker.
 */
function effectiveRating(entry, boat) {
  if (entry.phrf_override !== null && entry.phrf_override !== undefined) {
    return entry.phrf_override;
  }
  if (entry.using_spinnaker) return boat.phrf_base;
  return boat.phrf_spinnaker;
}

// --- 2c. Elapsed time --------------------------------------------------------

function toMillis(t) {
  if (t === null || t === undefined) return null;
  if (t instanceof Date) return t.getTime();
  const ms = new Date(t).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Elapsed seconds for an entry given the race's start configuration. Returns
 * null if the required timestamps are missing.
 *
 *  - simultaneous:                elapsed = finish - race.start_time
 *  - pursuit:                     elapsed = finish - boat start
 *                                 (entry.start_time, falling back to self_start_time)
 *  - self_timed/fully_independent: elapsed = self finish - self start
 *  - self_timed/rc_finish_self_start: elapsed = RC finish - self start
 *
 * For both self_timed modes the finish timestamp lives on entry.finish_time and
 * the start on entry.self_start_time; the modes differ operationally (who
 * records the finish), not arithmetically.
 */
function computeElapsedSeconds(race, entry) {
  const finish = toMillis(entry.finish_time);

  switch (race.start_type) {
    case 'simultaneous': {
      const start = toMillis(race.start_time);
      if (finish === null || start === null) return null;
      return Math.round((finish - start) / 1000);
    }
    case 'pursuit': {
      const start = toMillis(entry.start_time ?? entry.self_start_time);
      if (finish === null || start === null) return null;
      return Math.round((finish - start) / 1000);
    }
    case 'self_timed': {
      const start = toMillis(entry.self_start_time);
      if (finish === null || start === null) return null;
      return Math.round((finish - start) / 1000);
    }
    default:
      return null;
  }
}

// --- 2d. Score a race --------------------------------------------------------

const TIE_THRESHOLD_SECONDS = 1;

/**
 * Assign 1-based places to a list already sorted ascending by `time`. Entries
 * whose time is within TIE_THRESHOLD_SECONDS of the previous entry share its
 * place (standard "1, 1, 3" competition ranking). Mutates each item's
 * `placeField`.
 */
function assignPlaces(sortedFinishers, timeField, placeField) {
  let lastTime = null;
  let lastPlace = 0;
  sortedFinishers.forEach((item, index) => {
    const time = item[timeField];
    if (index > 0 && lastTime !== null && Math.abs(time - lastTime) <= TIE_THRESHOLD_SECONDS) {
      item[placeField] = lastPlace; // tie with previous
    } else {
      item[placeField] = index + 1;
      lastPlace = index + 1;
    }
    lastTime = time;
  });
}

/**
 * Score a single race.
 *
 * @param {object} race    Race record. Uses start_type, self_timed_mode, start_time.
 * @param {object[]} entries Entries to score. Each must include: boat_id,
 *   fleet_id, fleet_type ('phrf'|'one_design'), finish_status, and the relevant
 *   timestamps. phrf_override / using_spinnaker optional.
 * @param {object[]} boats  Boats referenced by entries (boat_id, phrf_base,
 *   phrf_spinnaker, rating_source...).
 * @returns {object[]} New array of enriched entries with elapsed_seconds,
 *   corrected_seconds, fleet_place, overall_place, rating_used, inferred,
 *   override_applied populated. Input is not mutated.
 */
function scoreRace(race, entries, boats) {
  const boatMap = new Map(boats.map((b) => [b.boat_id, b]));

  // 1. Enrich each entry with rating, elapsed and corrected time + flags.
  const scored = entries.map((entry) => {
    const boat = boatMap.get(entry.boat_id) || {};
    const rating = effectiveRating(entry, boat);
    const isFinisher = entry.finish_status === FINISHED;
    const isOneDesign = entry.fleet_type === 'one_design';

    let elapsed = null;
    let corrected = null;
    if (isFinisher) {
      elapsed = computeElapsedSeconds(race, entry);
      if (elapsed !== null && !isOneDesign) {
        corrected = Math.round(correctTimeToT(elapsed, rating));
      }
    }

    return {
      ...entry,
      rating_used: rating,
      inferred: boat.rating_source === 'inferred',
      override_applied:
        entry.phrf_override !== null && entry.phrf_override !== undefined,
      override_note: entry.phrf_override_note ?? null,
      elapsed_seconds: elapsed,
      corrected_seconds: corrected,
      fleet_place: null,
      overall_place: null,
    };
  });

  // 2. Per-fleet placing.
  const byFleet = new Map();
  for (const e of scored) {
    if (!byFleet.has(e.fleet_id)) byFleet.set(e.fleet_id, []);
    byFleet.get(e.fleet_id).push(e);
  }

  for (const fleetEntries of byFleet.values()) {
    const isOneDesign = fleetEntries.some((e) => e.fleet_type === 'one_design');
    const timeField = isOneDesign ? 'elapsed_seconds' : 'corrected_seconds';

    const finishers = fleetEntries
      .filter((e) => e.finish_status === FINISHED && e[timeField] !== null)
      .sort((a, b) => a[timeField] - b[timeField]);
    const nonFinishers = fleetEntries.filter(
      (e) => !(e.finish_status === FINISHED && e[timeField] !== null)
    );

    assignPlaces(finishers, timeField, 'fleet_place');
    // Non-finishers placed after all finishers, preserving input order.
    nonFinishers.forEach((e, i) => {
      e.fleet_place = finishers.length + i + 1;
    });
  }

  // 3. Overall placing across PHRF fleets only (one-design excluded).
  const phrfEntries = scored.filter((e) => e.fleet_type !== 'one_design');
  const overallFinishers = phrfEntries
    .filter((e) => e.finish_status === FINISHED && e.corrected_seconds !== null)
    .sort((a, b) => a.corrected_seconds - b.corrected_seconds);
  const overallNonFinishers = phrfEntries.filter(
    (e) => !(e.finish_status === FINISHED && e.corrected_seconds !== null)
  );

  assignPlaces(overallFinishers, 'corrected_seconds', 'overall_place');
  overallNonFinishers.forEach((e, i) => {
    e.overall_place = overallFinishers.length + i + 1;
  });
  // One-design entries are not part of overall standings.
  for (const e of scored) {
    if (e.fleet_type === 'one_design') e.overall_place = null;
  }

  return scored;
}

// --- 2e. Pursuit start calculator -------------------------------------------

/**
 * Compute pursuit start times.
 *
 * @param {object[]} boats Each { boatId, phrf } (or { boat_id, rating }).
 * @param {string} referenceBoatId The slowest boat (highest PHRF); starts first.
 * @param {Date|string} raceStartTime When the reference boat starts.
 * @param {object} [options]
 * @param {number} [options.factor] Seconds of delay per PHRF point. If omitted,
 *   derived from the fleet: raceSeconds / (650 + avgPHRF).
 * @param {number} [options.raceSeconds] Nominal race length used to derive the
 *   default factor (default: 2 hours).
 * @returns {{boatId:string, startTime:Date, intervalSeconds:number}[]} sorted
 *   ascending by start time (reference first, fastest boat last).
 */
function calculatePursuitStarts(boats, referenceBoatId, raceStartTime, options = {}) {
  const norm = boats.map((b) => ({
    boatId: b.boatId ?? b.boat_id,
    phrf: b.phrf ?? b.rating ?? b.phrf_base,
  }));

  const reference = norm.find((b) => b.boatId === referenceBoatId);
  if (!reference) {
    throw new Error(`Reference boat ${referenceBoatId} not found in fleet`);
  }

  const raceSeconds = options.raceSeconds ?? DEFAULT_PURSUIT_RACE_SECONDS;
  const avgPhrf = norm.reduce((sum, b) => sum + b.phrf, 0) / norm.length;
  const factor = options.factor ?? raceSeconds / (TOT_BASE + avgPhrf);

  const startMs = toMillis(raceStartTime);

  const result = norm.map((b) => {
    // Slower (higher PHRF) reference => 0; faster boats (lower PHRF) => positive.
    const intervalSeconds = Math.round((reference.phrf - b.phrf) * factor);
    return {
      boatId: b.boatId,
      intervalSeconds,
      startTime: new Date(startMs + intervalSeconds * 1000),
    };
  });

  result.sort((a, b) => a.intervalSeconds - b.intervalSeconds);
  return result;
}

// --- 2f. Series scoring ------------------------------------------------------

/**
 * Parse a throwout rule string into ordered thresholds.
 * "1 throwout after 4 races, 2 after 8 races"
 *   => [ { throwouts: 1, after: 4 }, { throwouts: 2, after: 8 } ]
 * Returns [] for empty/unparseable input.
 */
function parseThrowoutRule(rule) {
  if (!rule || typeof rule !== 'string') return [];
  const re = /(\d+)\s*(?:throwouts?\s*)?after\s*(\d+)\s*races?/gi;
  const rules = [];
  let m;
  while ((m = re.exec(rule)) !== null) {
    rules.push({ throwouts: parseInt(m[1], 10), after: parseInt(m[2], 10) });
  }
  return rules.sort((a, b) => a.after - b.after);
}

/**
 * Number of throwouts allowed given a parsed rule set and races sailed: the
 * count from the highest threshold that has been reached.
 */
function allowedThrowouts(rules, racesSailed) {
  let allowed = 0;
  for (const r of rules) {
    if (racesSailed >= r.after) allowed = r.throwouts;
  }
  return allowed;
}

/**
 * Points a boat earns in one race result.
 *  - finished: its fleet place (1st = 1 point)
 *  - DNS/DNF/DSQ/RAF: fleetSize + 1
 */
function racePoints(result) {
  if (result.finishStatus === FINISHED) return result.fleetPlace;
  return result.fleetSize + 1;
}

/**
 * Score series standings.
 *
 * @param {object} series Series config; uses `throwout_rule`.
 * @param {object[]} raceResults Races in the series, each:
 *   { raceId, raceDate, results: [ { boatId, fleetId, finishStatus,
 *     fleetPlace, fleetSize } ] }
 * @returns {object[]} standings sorted by rank:
 *   { boatId, fleetId, total_points, races_sailed, throwouts:[{raceId,points}],
 *     rank, perRace:[{raceId, raceDate, points, dropped}] }
 */
function scoreSeriesStandings(series, raceResults) {
  const rules = parseThrowoutRule(series && series.throwout_rule);

  // Order races chronologically so "most recent" is well defined. Stable sort
  // by date string (ISO/Date both compare correctly via getTime fallback).
  const orderedRaces = [...raceResults].sort((a, b) => {
    const ta = toMillis(a.raceDate) ?? 0;
    const tb = toMillis(b.raceDate) ?? 0;
    return ta - tb;
  });

  // Gather per-boat race lines.
  const boats = new Map(); // boatId -> { boatId, fleetId, lines: [] }
  orderedRaces.forEach((race) => {
    race.results.forEach((r) => {
      if (!boats.has(r.boatId)) {
        boats.set(r.boatId, { boatId: r.boatId, fleetId: r.fleetId, lines: [] });
      }
      const boat = boats.get(r.boatId);
      boat.fleetId = r.fleetId ?? boat.fleetId; // keep most recent fleet
      boat.lines.push({
        raceId: race.raceId,
        raceDate: race.raceDate,
        points: racePoints(r),
      });
    });
  });

  // Compute totals + throwouts per boat.
  const standings = [];
  for (const boat of boats.values()) {
    const racesSailed = boat.lines.length;
    const dropCount = allowedThrowouts(rules, racesSailed);

    // Identify which lines to drop: the worst (highest points). Ties broken by
    // dropping the later race first (arbitrary but deterministic).
    const ranked = boat.lines
      .map((line, idx) => ({ line, idx }))
      .sort((a, b) => b.line.points - a.line.points || b.idx - a.idx);
    const droppedIdx = new Set(ranked.slice(0, dropCount).map((x) => x.idx));

    const throwouts = [];
    let total = 0;
    const perRace = boat.lines.map((line, idx) => {
      const dropped = droppedIdx.has(idx);
      if (dropped) {
        throwouts.push({ raceId: line.raceId, points: line.points });
      } else {
        total += line.points;
      }
      return {
        raceId: line.raceId,
        raceDate: line.raceDate,
        points: line.points,
        dropped,
      };
    });

    standings.push({
      boatId: boat.boatId,
      fleetId: boat.fleetId,
      total_points: total,
      races_sailed: racesSailed,
      throwouts,
      perRace,
      rank: null,
    });
  }

  // Rank: lowest total wins. Tie-break by the most recent race each boat sailed
  // (lower points in that race ranks higher).
  const mostRecentPoints = (s) => {
    const last = s.perRace[s.perRace.length - 1];
    return last ? last.points : Infinity;
  };
  standings.sort(
    (a, b) =>
      a.total_points - b.total_points ||
      mostRecentPoints(a) - mostRecentPoints(b)
  );
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  return standings;
}

module.exports = {
  correctTimeToT,
  effectiveRating,
  computeElapsedSeconds,
  scoreRace,
  calculatePursuitStarts,
  scoreSeriesStandings,
  // exported for unit testing / reuse
  parseThrowoutRule,
  allowedThrowouts,
  racePoints,
};
