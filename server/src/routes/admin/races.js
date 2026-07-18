'use strict';

const express = require('express');
const {
  START_TYPES,
  SELF_TIMED_MODES,
  RACE_STATUSES,
} = require('@easyphrf/shared');
const db = require('../../db');
const { asyncHandler, notFound, badRequest } = require('../../utils/errors');
const { requireFields, ensureEnum, pickDefined } = require('../../utils/validate');
const { buildUpdate } = require('../../utils/sql');
const { effectiveRating } = require('../../scoring');
const { calculatePursuitStarts } = require('../../scoring');
const {
  loadRace,
  assembleRaceDetail,
  ownedRace,
  ensureDefaultFleet,
} = require('../../services/raceService');
const { scoreAndSave } = require('../../services/scoringService');
const { zonedTimeToUtc, toDateOnly } = require('../../utils/time');
const fleetsRouter = require('./fleets');
const entriesRouter = require('./entries');

const router = express.Router();

// `start_time` is never set directly; it is derived from a submitted local
// time-of-day (`start_time_of_day`) combined with race_date in the club tz.
const EDITABLE = [
  'name',
  'race_date',
  'start_type',
  'self_timed_mode',
  'race_distance',
  'time_limit_secs',
  'series_id',
  'revision_notes',
  'expected_duration_minutes',
];

/**
 * Resolve a race's start_time from a submitted local time of day. The wall
 * clock is interpreted in the club timezone on the race's date. Simultaneous
 * and pursuit races carry a scheduled start; self_timed never does, so any
 * submitted value is ignored.
 */
function resolveStartTime({ startType, raceDate, timeOfDay, timeZone }) {
  if (startType === 'self_timed') return null;
  if (timeOfDay === null || timeOfDay === undefined || timeOfDay === '') return null;
  return zonedTimeToUtc(raceDate, timeOfDay, timeZone);
}

// GET /admin/races
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT * FROM races WHERE club_id = $1 ORDER BY race_date DESC, name`,
      [req.club.club_id]
    );
    res.json(result.rows);
  })
);

// POST /admin/races
router.post(
  '/',
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'race_date', 'start_type']);
    ensureEnum(req.body.start_type, START_TYPES, 'start_type');
    ensureEnum(req.body.self_timed_mode, SELF_TIMED_MODES, 'self_timed_mode');
    const b = req.body;
    const startTime = resolveStartTime({
      startType: b.start_type,
      raceDate: b.race_date,
      timeOfDay: b.start_time_of_day,
      timeZone: req.club.timezone,
    });
    const result = await db.query(
      `INSERT INTO races
         (club_id, series_id, name, race_date, start_type, self_timed_mode,
          race_distance, time_limit_secs, status, start_time, expected_duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10)
       RETURNING *`,
      [
        req.club.club_id,
        b.series_id ?? null,
        b.name,
        b.race_date,
        b.start_type,
        b.self_timed_mode ?? null,
        b.race_distance ?? null,
        b.time_limit_secs ?? null,
        startTime,
        b.expected_duration_minutes ?? null,
      ]
    );
    // Fleet setup is optional: guarantee a fleet exists behind the scenes so
    // entries can attach and scoring can run without any explicit setup.
    await ensureDefaultFleet(result.rows[0].race_id);
    // Propagate the race's gun time to all fleets (shared-start default).
    if (startTime) {
      await db.query('UPDATE fleets SET start_time = $1 WHERE race_id = $2', [
        startTime,
        result.rows[0].race_id,
      ]);
    }
    res.status(201).json(result.rows[0]);
  })
);

// GET /admin/races/:id — full detail (for edit / results screens)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = await loadRace(req.club.club_id, req.params.id);
    res.json(assembleRaceDetail(data, { timeZone: req.club.timezone }));
  })
);

// PUT /admin/races/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureEnum(req.body.start_type, START_TYPES, 'start_type');
    ensureEnum(req.body.self_timed_mode, SELF_TIMED_MODES, 'self_timed_mode');
    ensureEnum(req.body.status, RACE_STATUSES, 'status');
    const fields = pickDefined(req.body, [...EDITABLE, 'status']);

    // A submitted time-of-day is converted to start_time in the club tz, using
    // the race's date (from this request if changing it, else the stored one).
    if ('start_time_of_day' in req.body) {
      const existing = await ownedRace(req.club.club_id, req.params.id);
      fields.start_time = resolveStartTime({
        startType: req.body.start_type ?? existing.start_type,
        raceDate: req.body.race_date ?? existing.race_date,
        timeOfDay: req.body.start_time_of_day,
        timeZone: req.club.timezone,
      });
    }

    const { clause, values, nextIndex, isEmpty } = buildUpdate(fields);
    if (isEmpty) throw badRequest('No updatable fields supplied');
    const result = await db.query(
      `UPDATE races SET ${clause}
        WHERE race_id = $${nextIndex} AND club_id = $${nextIndex + 1} RETURNING *`,
      [...values, req.params.id, req.club.club_id]
    );
    if (result.rows.length === 0) throw notFound('Race not found');
    // Saving (or advancing) a race must leave it with at least one fleet.
    await ensureDefaultFleet(req.params.id);
    // When the shared gun time changes, propagate it to all fleets so each
    // fleet's start_time reflects the single shared start.
    if ('start_time_of_day' in req.body) {
      await db.query('UPDATE fleets SET start_time = $1 WHERE race_id = $2', [
        fields.start_time,
        req.params.id,
      ]);
    }
    res.json(result.rows[0]);
  })
);

// DELETE /admin/races/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await ownedRace(req.club.club_id, req.params.id);
    // Explicit cleanup in dependency order so the delete works correctly in
    // both real Postgres and pg-mem (which mis-orders cascade deletes):
    // 1. series_standings references fleets with no cascade
    // 2. race_entries references fleets with no cascade
    // 3. fleets + entries both cascade from race_id, but pg-mem orders wrong
    const fleetsRes = await db.query('SELECT fleet_id FROM fleets WHERE race_id = $1', [req.params.id]);
    if (fleetsRes.rows.length > 0) {
      const fleetIds = fleetsRes.rows.map((r) => r.fleet_id);
      await db.query(`DELETE FROM series_standings WHERE fleet_id = ANY($1::uuid[])`, [fleetIds]);
    }
    await db.query('DELETE FROM race_entries WHERE race_id = $1', [req.params.id]);
    await db.query('DELETE FROM races WHERE race_id = $1 AND club_id = $2', [
      req.params.id,
      req.club.club_id,
    ]);
    res.json({ race_id: req.params.id, deleted: true });
  })
);

// POST /admin/races/:id/score — calculate and persist corrected times
router.post(
  '/:id/score',
  asyncHandler(async (req, res) => {
    await scoreAndSave(req.club.club_id, req.params.id);
    const data = await loadRace(req.club.club_id, req.params.id);
    res.json(assembleRaceDetail(data, { timeZone: req.club.timezone }));
  })
);

// POST /admin/races/:id/publish
router.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    await ownedRace(req.club.club_id, req.params.id);
    const result = await db.query(
      `UPDATE races SET status = 'published', published_at = NOW()
        WHERE race_id = $1 AND club_id = $2 RETURNING *`,
      [req.params.id, req.club.club_id]
    );
    res.json(result.rows[0]);
  })
);

// POST /admin/races/:id/revise — requires revision_notes
router.post(
  '/:id/revise',
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['revision_notes']);
    const race = await ownedRace(req.club.club_id, req.params.id);
    if (!['published', 'revised'].includes(race.status)) {
      throw badRequest('Only a published race can be revised');
    }
    const result = await db.query(
      `UPDATE races SET status = 'revised', revision_notes = $1, revised_at = NOW()
        WHERE race_id = $2 AND club_id = $3 RETURNING *`,
      [req.body.revision_notes, req.params.id, req.club.club_id]
    );
    res.json(result.rows[0]);
  })
);

// GET /admin/races/:id/startsheet — pursuit start times
router.get(
  '/:id/startsheet',
  asyncHandler(async (req, res) => {
    const race = await ownedRace(req.club.club_id, req.params.id);
    if (race.start_type !== 'pursuit') {
      throw badRequest('Start sheets are only available for pursuit races');
    }
    // No dead-end when the start time is unset: report it so the client can
    // collect one inline and retry, rather than throwing an error.
    if (!race.start_time) {
      res.json({
        race_id: race.race_id,
        needs_start_time: true,
        race_date: toDateOnly(race.race_date),
        timezone: req.club.timezone,
        starts: [],
      });
      return;
    }

    const entriesRes = await db.query(
      `SELECT e.*, b.boat_name, b.sail_number, b.phrf_base, b.phrf_spinnaker
         FROM race_entries e JOIN boats b ON e.boat_id = b.boat_id
        WHERE e.race_id = $1`,
      [req.params.id]
    );
    const entries = entriesRes.rows;
    if (entries.length === 0) throw badRequest('No entries to build a start sheet');

    const boats = entries.map((e) => ({
      boatId: e.boat_id,
      phrf: effectiveRating(e, e),
    }));

    // Reference = explicit query param, else slowest (highest PHRF) boat.
    let referenceBoatId = req.query.reference_boat_id;
    if (!referenceBoatId) {
      referenceBoatId = boats.reduce((slowest, b) => (b.phrf > slowest.phrf ? b : slowest), boats[0]).boatId;
    }

    const opts = {};
    if (req.query.factor) {
      opts.factor = Number(req.query.factor);
    } else if (race.expected_duration_minutes != null) {
      opts.raceSeconds = race.expected_duration_minutes * 60;
    }
    const starts = calculatePursuitStarts(boats, referenceBoatId, race.start_time, opts);

    const boatById = new Map(entries.map((e) => [e.boat_id, e]));
    const enriched = starts.map((s) => {
      const boat = boatById.get(s.boatId);
      return {
        ...s,
        boat_name: boat.boat_name,
        sail_number: boat.sail_number,
        phrf: effectiveRating(boat, boat),
      };
    });

    res.json({
      race_id: race.race_id,
      reference_boat_id: referenceBoatId,
      timezone: req.club.timezone,
      starts: enriched,
    });
  })
);

// Nested routers.
router.use('/:id/fleets', fleetsRouter);
router.use('/:id/entries', entriesRouter);

module.exports = router;
