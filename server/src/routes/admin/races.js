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
const { loadRace, assembleRaceDetail, ownedRace } = require('../../services/raceService');
const { scoreAndSave } = require('../../services/scoringService');
const fleetsRouter = require('./fleets');
const entriesRouter = require('./entries');

const router = express.Router();

const EDITABLE = [
  'name',
  'race_date',
  'start_type',
  'self_timed_mode',
  'race_distance',
  'time_limit_secs',
  'series_id',
  'start_time',
  'revision_notes',
];

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
    const result = await db.query(
      `INSERT INTO races
         (club_id, series_id, name, race_date, start_type, self_timed_mode,
          race_distance, time_limit_secs, status, start_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
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
        b.start_time ?? null,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

// GET /admin/races/:id — full detail (for edit / results screens)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = await loadRace(req.club.club_id, req.params.id);
    res.json(assembleRaceDetail(data));
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
    const { clause, values, nextIndex, isEmpty } = buildUpdate(fields);
    if (isEmpty) throw badRequest('No updatable fields supplied');
    const result = await db.query(
      `UPDATE races SET ${clause}
        WHERE race_id = $${nextIndex} AND club_id = $${nextIndex + 1} RETURNING *`,
      [...values, req.params.id, req.club.club_id]
    );
    if (result.rows.length === 0) throw notFound('Race not found');
    res.json(result.rows[0]);
  })
);

// DELETE /admin/races/:id — draft races only
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const race = await ownedRace(req.club.club_id, req.params.id);
    if (race.status !== 'draft') {
      throw badRequest('Only draft races can be deleted');
    }
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
    res.json(assembleRaceDetail(data));
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
    if (!race.start_time) {
      throw badRequest('Set the race start_time before generating a start sheet');
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

    const factor = req.query.factor ? Number(req.query.factor) : undefined;
    const starts = calculatePursuitStarts(boats, referenceBoatId, race.start_time, { factor });

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

    res.json({ race_id: race.race_id, reference_boat_id: referenceBoatId, starts: enriched });
  })
);

// Nested routers.
router.use('/:id/fleets', fleetsRouter);
router.use('/:id/entries', entriesRouter);

module.exports = router;
