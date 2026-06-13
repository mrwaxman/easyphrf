'use strict';

const express = require('express');
const { SPINNAKER_MODES } = require('@easyphrf/shared');
const db = require('../../db');
const { asyncHandler, notFound, badRequest } = require('../../utils/errors');
const { requireFields, ensureEnum, pickDefined } = require('../../utils/validate');
const { buildUpdate } = require('../../utils/sql');
const { recalculateAndSave } = require('../../services/seriesService');

const router = express.Router();

const EDITABLE = ['name', 'season_year', 'throwout_rule', 'spinnaker_mode', 'notes', 'active', 'min_races_to_qualify'];

// GET /admin/series
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await db.query(
      'SELECT * FROM series WHERE club_id = $1 ORDER BY season_year DESC, name',
      [req.club.club_id]
    );
    res.json(result.rows);
  })
);

// POST /admin/series
router.post(
  '/',
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'season_year']);
    ensureEnum(req.body.spinnaker_mode, SPINNAKER_MODES, 'spinnaker_mode');
    const b = req.body;
    const result = await db.query(
      `INSERT INTO series (club_id, name, season_year, throwout_rule, spinnaker_mode, notes, min_races_to_qualify)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.club.club_id, b.name, b.season_year, b.throwout_rule ?? null, b.spinnaker_mode ?? 'per_race', b.notes ?? null, b.min_races_to_qualify ?? null]
    );
    res.status(201).json(result.rows[0]);
  })
);

// PUT /admin/series/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureEnum(req.body.spinnaker_mode, SPINNAKER_MODES, 'spinnaker_mode');
    const fields = pickDefined(req.body, EDITABLE);
    const { clause, values, nextIndex, isEmpty } = buildUpdate(fields);
    if (isEmpty) throw badRequest('No updatable fields supplied');
    const result = await db.query(
      `UPDATE series SET ${clause}
        WHERE series_id = $${nextIndex} AND club_id = $${nextIndex + 1} RETURNING *`,
      [...values, req.params.id, req.club.club_id]
    );
    if (result.rows.length === 0) throw notFound('Series not found');
    res.json(result.rows[0]);
  })
);

// POST /admin/series/:id/recalculate
router.post(
  '/:id/recalculate',
  asyncHandler(async (req, res) => {
    const data = await recalculateAndSave(req.club.club_id, req.params.id);
    res.json(data);
  })
);

module.exports = router;
