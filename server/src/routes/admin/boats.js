'use strict';

const express = require('express');
const multer = require('multer');
const { RATING_SOURCES } = require('@easyphrf/shared');
const db = require('../../db');
const { asyncHandler, notFound, badRequest } = require('../../utils/errors');
const { requireFields, ensureEnum, pickDefined } = require('../../utils/validate');
const { buildUpdate } = require('../../utils/sql');
const { parsePhrfPdf, confirmImport } = require('../../services/pdfImport');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const EDITABLE = [
  'sail_number',
  'boat_name',
  'model',
  'skipper_name',
  'phrf_base',
  'phrf_spinnaker',
  'spinnaker_offset',
  'rating_source',
  'rating_notes',
  'active',
];

// GET /admin/boats
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await db.query(
      'SELECT * FROM boats WHERE club_id = $1 ORDER BY active DESC, sail_number',
      [req.club.club_id]
    );
    res.json(result.rows);
  })
);

// POST /admin/boats
router.post(
  '/',
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['sail_number', 'boat_name', 'skipper_name', 'phrf_base', 'phrf_spinnaker']);
    ensureEnum(req.body.rating_source, RATING_SOURCES, 'rating_source');
    const b = req.body;
    const result = await db.query(
      `INSERT INTO boats
         (club_id, sail_number, boat_name, model, skipper_name, phrf_base,
          phrf_spinnaker, spinnaker_offset, rating_source, rating_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.club.club_id,
        b.sail_number,
        b.boat_name,
        b.model ?? null,
        b.skipper_name,
        b.phrf_base,
        b.phrf_spinnaker,
        b.spinnaker_offset ?? 0,
        b.rating_source ?? 'official',
        b.rating_notes ?? null,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

// PUT /admin/boats/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureEnum(req.body.rating_source, RATING_SOURCES, 'rating_source');
    const fields = pickDefined(req.body, EDITABLE);
    const { clause, values, nextIndex, isEmpty } = buildUpdate(fields);
    if (isEmpty) throw badRequest('No updatable fields supplied');

    const result = await db.query(
      `UPDATE boats SET ${clause}, updated_at = NOW()
        WHERE boat_id = $${nextIndex} AND club_id = $${nextIndex + 1}
        RETURNING *`,
      [...values, req.params.id, req.club.club_id]
    );
    if (result.rows.length === 0) throw notFound('Boat not found');
    res.json(result.rows[0]);
  })
);

// DELETE /admin/boats/:id — soft delete (deactivate)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `UPDATE boats SET active = FALSE, updated_at = NOW()
        WHERE boat_id = $1 AND club_id = $2 RETURNING boat_id`,
      [req.params.id, req.club.club_id]
    );
    if (result.rows.length === 0) throw notFound('Boat not found');
    res.json({ boat_id: result.rows[0].boat_id, active: false });
  })
);

// POST /admin/boats/import-pdf — parse & preview
router.post(
  '/import-pdf',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded (expected multipart field "file")');
    const parsed = await parsePhrfPdf(req.file.buffer);
    res.json({ records: parsed.records, unparsed_lines: parsed.unparsedLines });
  })
);

// POST /admin/boats/import-pdf/confirm — insert reviewed records
router.post(
  '/import-pdf/confirm',
  asyncHandler(async (req, res) => {
    const records = req.body.records;
    if (!Array.isArray(records)) throw badRequest('Expected a "records" array');
    const result = await confirmImport(req.club.club_id, records);
    res.json(result);
  })
);

module.exports = router;
