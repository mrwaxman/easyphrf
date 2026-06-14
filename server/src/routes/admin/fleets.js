'use strict';

const express = require('express');
const { FLEET_TYPES, FLEET_SPINNAKER_POLICIES } = require('@easyphrf/shared');
const db = require('../../db');
const { asyncHandler, notFound, badRequest } = require('../../utils/errors');
const { requireFields, ensureEnum, pickDefined } = require('../../utils/validate');
const { buildUpdate } = require('../../utils/sql');
const { ownedRace } = require('../../services/raceService');
const { zonedTimeToUtc } = require('../../utils/time');

// mergeParams so :id (race id) from the parent router is visible here.
const router = express.Router({ mergeParams: true });

const EDITABLE = ['name', 'fleet_type', 'phrf_min', 'phrf_max', 'uses_spinnaker', 'start_time'];

// POST /admin/races/:id/fleets
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const race = await ownedRace(req.club.club_id, req.params.id);
    requireFields(req.body, ['name', 'fleet_type']);
    ensureEnum(req.body.fleet_type, FLEET_TYPES, 'fleet_type');
    ensureEnum(req.body.uses_spinnaker, FLEET_SPINNAKER_POLICIES, 'uses_spinnaker');
    const b = req.body;
    const startTime =
      'start_time_of_day' in b
        ? zonedTimeToUtc(race.race_date, b.start_time_of_day, req.club.timezone)
        : null;
    const result = await db.query(
      `INSERT INTO fleets (race_id, name, fleet_type, phrf_min, phrf_max, uses_spinnaker, start_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.params.id,
        b.name,
        b.fleet_type,
        b.phrf_min ?? null,
        b.phrf_max ?? null,
        b.uses_spinnaker ?? 'optional',
        startTime,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

// PUT /admin/races/:id/fleets/:fid
router.put(
  '/:fid',
  asyncHandler(async (req, res) => {
    const race = await ownedRace(req.club.club_id, req.params.id);
    ensureEnum(req.body.fleet_type, FLEET_TYPES, 'fleet_type');
    ensureEnum(req.body.uses_spinnaker, FLEET_SPINNAKER_POLICIES, 'uses_spinnaker');
    const fields = pickDefined(req.body, EDITABLE);
    if ('start_time_of_day' in req.body) {
      fields.start_time = zonedTimeToUtc(race.race_date, req.body.start_time_of_day, req.club.timezone);
    }
    const { clause, values, nextIndex, isEmpty } = buildUpdate(fields);
    if (isEmpty) throw badRequest('No updatable fields supplied');
    const result = await db.query(
      `UPDATE fleets SET ${clause}
        WHERE fleet_id = $${nextIndex} AND race_id = $${nextIndex + 1} RETURNING *`,
      [...values, req.params.fid, req.params.id]
    );
    if (result.rows.length === 0) throw notFound('Fleet not found');
    res.json(result.rows[0]);
  })
);

// DELETE /admin/races/:id/fleets/:fid
router.delete(
  '/:fid',
  asyncHandler(async (req, res) => {
    await ownedRace(req.club.club_id, req.params.id);
    const result = await db.query(
      'DELETE FROM fleets WHERE fleet_id = $1 AND race_id = $2 RETURNING fleet_id',
      [req.params.fid, req.params.id]
    );
    if (result.rows.length === 0) throw notFound('Fleet not found');
    res.json({ fleet_id: result.rows[0].fleet_id, deleted: true });
  })
);

module.exports = router;
