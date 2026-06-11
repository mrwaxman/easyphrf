'use strict';

const db = require('../db');
const { asyncHandler, notFound, badRequest } = require('../utils/errors');

/**
 * Resolve the active club onto req.club. Resolution order:
 *   1. a :slug route param (public routes)
 *   2. the X-Club-Slug header (admin routes)
 *   3. a club_id query param
 *
 * 400 if no identifier is supplied; 404 if it matches no club. (Subdomain
 * routing replaces the header/query path in a later phase.)
 */
const resolveClub = asyncHandler(async (req, res, next) => {
  const slug = req.params.slug || req.headers['x-club-slug'];
  const clubId = req.query.club_id;

  let result;
  if (slug) {
    result = await db.query('SELECT * FROM clubs WHERE slug = $1', [slug]);
  } else if (clubId) {
    result = await db.query('SELECT * FROM clubs WHERE club_id = $1', [clubId]);
  } else {
    throw badRequest('Club context required (X-Club-Slug header or club_id query param)');
  }

  if (result.rows.length === 0) {
    throw notFound('Club not found');
  }
  req.club = result.rows[0];
  next();
});

module.exports = { resolveClub };
