'use strict';

const express = require('express');
const { FINISH_STATUSES } = require('@easyphrf/shared');
const db = require('../../db');
const { asyncHandler, notFound, badRequest } = require('../../utils/errors');
const { requireFields, ensureEnum, pickDefined } = require('../../utils/validate');
const { buildUpdate } = require('../../utils/sql');
const { ownedRace } = require('../../services/raceService');

const router = express.Router({ mergeParams: true });

const EDITABLE = [
  'fleet_id',
  'phrf_override',
  'phrf_override_note',
  'using_spinnaker',
  'self_start_time',
  'finish_time',
  'finish_status',
];

// GET /admin/races/:id/entries — entries joined to boat data
router.get(
  '/',
  asyncHandler(async (req, res) => {
    await ownedRace(req.club.club_id, req.params.id);
    const result = await db.query(
      `SELECT e.*, b.boat_name, b.sail_number, b.skipper_name, b.model,
              b.phrf_base, b.phrf_spinnaker, b.rating_source
         FROM race_entries e
         JOIN boats b ON e.boat_id = b.boat_id
        WHERE e.race_id = $1
        ORDER BY e.fleet_id, b.sail_number`,
      [req.params.id]
    );
    res.json(result.rows);
  })
);

// POST /admin/races/:id/entries
router.post(
  '/',
  asyncHandler(async (req, res) => {
    await ownedRace(req.club.club_id, req.params.id);
    requireFields(req.body, ['fleet_id', 'boat_id']);
    ensureEnum(req.body.finish_status, FINISH_STATUSES, 'finish_status');
    const b = req.body;
    const result = await db.query(
      `INSERT INTO race_entries
         (race_id, fleet_id, boat_id, phrf_override, phrf_override_note,
          using_spinnaker, self_start_time, finish_time, finish_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.params.id,
        b.fleet_id,
        b.boat_id,
        b.phrf_override ?? null,
        b.phrf_override_note ?? null,
        b.using_spinnaker ?? false,
        b.self_start_time ?? null,
        b.finish_time ?? null,
        b.finish_status ?? 'finished',
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

// PUT /admin/races/:id/entries/:eid
router.put(
  '/:eid',
  asyncHandler(async (req, res) => {
    await ownedRace(req.club.club_id, req.params.id);
    ensureEnum(req.body.finish_status, FINISH_STATUSES, 'finish_status');
    const fields = pickDefined(req.body, EDITABLE);
    const { clause, values, nextIndex, isEmpty } = buildUpdate(fields);
    if (isEmpty) throw badRequest('No updatable fields supplied');
    const result = await db.query(
      `UPDATE race_entries SET ${clause}
        WHERE entry_id = $${nextIndex} AND race_id = $${nextIndex + 1} RETURNING *`,
      [...values, req.params.eid, req.params.id]
    );
    if (result.rows.length === 0) throw notFound('Entry not found');
    res.json(result.rows[0]);
  })
);

// DELETE /admin/races/:id/entries/:eid
router.delete(
  '/:eid',
  asyncHandler(async (req, res) => {
    await ownedRace(req.club.club_id, req.params.id);
    const result = await db.query(
      'DELETE FROM race_entries WHERE entry_id = $1 AND race_id = $2 RETURNING entry_id',
      [req.params.eid, req.params.id]
    );
    if (result.rows.length === 0) throw notFound('Entry not found');
    res.json({ entry_id: result.rows[0].entry_id, deleted: true });
  })
);

module.exports = router;
