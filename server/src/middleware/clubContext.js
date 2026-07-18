'use strict';

const db = require('../db');
const { asyncHandler, notFound } = require('../utils/errors');

/**
 * Resolve the active club onto req.club.
 *
 * SINGLE-TENANT MODE (current): the app serves exactly one club, configured by
 * SINGLE_CLUB_SLUG (default 'buccaneer'). Any :slug route param or X-Club-Slug
 * header on the request is ignored — every request resolves the one club.
 *
 * The multi-tenant resolution below is commented out, not deleted, so it can be
 * restored when multi-club support returns. See the plan / Phase 2.
 */
const SINGLE_CLUB_SLUG = process.env.SINGLE_CLUB_SLUG || 'buccaneer';

const resolveClub = asyncHandler(async (req, res, next) => {
  // --- PHASE 2 MULTI-TENANT (restore later) -------------------------------
  // Resolution order was: 1. :slug route param (public), 2. X-Club-Slug header
  // (admin), 3. club_id query param. 400 if none supplied, 404 if no match.
  //
  // const slug = req.params.slug || req.headers['x-club-slug'];
  // const clubId = req.query.club_id;
  //
  // let result;
  // if (slug) {
  //   result = await db.query('SELECT * FROM clubs WHERE slug = $1', [slug]);
  // } else if (clubId) {
  //   result = await db.query('SELECT * FROM clubs WHERE club_id = $1', [clubId]);
  // } else {
  //   throw badRequest('Club context required (X-Club-Slug header or club_id query param)');
  // }
  // ------------------------------------------------------------------------

  const result = await db.query('SELECT * FROM clubs WHERE slug = $1', [SINGLE_CLUB_SLUG]);

  if (result.rows.length === 0) {
    throw notFound('Club not found');
  }
  req.club = result.rows[0];
  next();
});

module.exports = { resolveClub };
