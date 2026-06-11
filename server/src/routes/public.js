'use strict';

const express = require('express');
const db = require('../db');
const { resolveClub } = require('../middleware/clubContext');
const { asyncHandler, notFound } = require('../utils/errors');
const { loadRace, assembleRaceDetail } = require('../services/raceService');
const { computeStandings } = require('../services/seriesService');
const { renderRaceResultsPdf } = require('../pdf/raceResultsPdf');
const { renderSeriesStandingsPdf } = require('../pdf/seriesStandingsPdf');

const router = express.Router();

/** Public-safe view of a club. */
function publicClub(club) {
  return {
    club_id: club.club_id,
    name: club.name,
    slug: club.slug,
    timezone: club.timezone,
    scoring_method: club.scoring_method,
    spinnaker_mode: club.spinnaker_mode,
  };
}

async function attachFleetNames(races) {
  for (const race of races) {
    const res = await db.query(
      'SELECT name, fleet_type FROM fleets WHERE race_id = $1 ORDER BY fleet_type, name',
      [race.race_id]
    );
    race.fleets = res.rows;
  }
  return races;
}

// GET /clubs/:slug
router.get(
  '/clubs/:slug',
  resolveClub,
  asyncHandler(async (req, res) => {
    res.json(publicClub(req.club));
  })
);

// GET /clubs/:slug/races — published races, most recent first
router.get(
  '/clubs/:slug/races',
  resolveClub,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT race_id, name, race_date, start_type, status, series_id, published_at, revised_at
         FROM races
        WHERE club_id = $1 AND status IN ('published', 'revised')
        ORDER BY race_date DESC, name`,
      [req.club.club_id]
    );
    await attachFleetNames(result.rows);
    res.json(result.rows);
  })
);

// GET /clubs/:slug/races/:id — published race detail with results
router.get(
  '/clubs/:slug/races/:id',
  resolveClub,
  asyncHandler(async (req, res) => {
    const data = await loadRace(req.club.club_id, req.params.id, { publishedOnly: true });
    res.json(assembleRaceDetail(data));
  })
);

// GET /clubs/:slug/races/:id/pdf
router.get(
  '/clubs/:slug/races/:id/pdf',
  resolveClub,
  asyncHandler(async (req, res) => {
    const data = await loadRace(req.club.club_id, req.params.id, { publishedOnly: true });
    const detail = assembleRaceDetail(data);
    const buffer = await renderRaceResultsPdf(detail, req.club);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="race-${req.params.id}.pdf"`);
    res.send(buffer);
  })
);

// GET /clubs/:slug/series — active series
router.get(
  '/clubs/:slug/series',
  resolveClub,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT * FROM series WHERE club_id = $1 AND active = TRUE
        ORDER BY season_year DESC, name`,
      [req.club.club_id]
    );
    res.json(result.rows);
  })
);

// GET /clubs/:slug/series/:id — series detail with standings
router.get(
  '/clubs/:slug/series/:id',
  resolveClub,
  asyncHandler(async (req, res) => {
    const data = await computeStandings(req.club.club_id, req.params.id);
    res.json(data);
  })
);

// GET /clubs/:slug/series/:id/pdf
router.get(
  '/clubs/:slug/series/:id/pdf',
  resolveClub,
  asyncHandler(async (req, res) => {
    const data = await computeStandings(req.club.club_id, req.params.id);
    const buffer = await renderSeriesStandingsPdf(data, req.club);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="series-${req.params.id}.pdf"`);
    res.send(buffer);
  })
);

module.exports = router;
