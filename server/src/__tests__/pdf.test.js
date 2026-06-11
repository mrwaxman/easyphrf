'use strict';

// The binary PDF -> text decode (pdf-parse's bundled, very old pdf.js) cannot
// read PDFs under Node 22, so we stub it and feed canned extracted text. This
// exercises the full upload -> parse -> preview -> confirm chain; the parsing
// heuristic itself is unit-tested in services/__tests__/pdfImport.test.js.
// `mock`-prefixed so the jest.mock factory may reference it (read lazily).
const mockSampleText = [
  'Sail        Boat            Model      Skipper         Base  Spin',
  'USA 12345   Blue Streak     J/105      Jane Skipper    84    72',
  'USA 678     Wind Dancer     Beneteau   Bob Helm        120   108',
].join('\n');

jest.mock('pdf-parse/lib/pdf-parse.js', () => jest.fn(async () => ({ text: mockSampleText })));

const request = require('supertest');
const { createApp } = require('../app');
const db = require('../db');
const { createTestDb } = require('./helpers/testDb');
const { createScoredRace } = require('./helpers/seedData');
const { renderRaceResultsPdf } = require('../pdf/raceResultsPdf');
const { renderSeriesStandingsPdf } = require('../pdf/seriesStandingsPdf');
const { loadRace, assembleRaceDetail } = require('../services/raceService');
const { computeStandings } = require('../services/seriesService');

const app = createApp({ enableClerk: false });
const ADMIN = { 'X-Test-Auth': 'admin-user', 'X-Club-Slug': 'demo' };

let club;
beforeEach(async () => {
  ({ club } = await createTestDb());
});
afterEach(async () => {
  await db.close();
});

describe('PDF import endpoint', () => {
  test('POST /import-pdf returns a parsed preview', async () => {
    const res = await request(app)
      .post('/api/v1/admin/boats/import-pdf')
      .set(ADMIN)
      .attach('file', Buffer.from('%PDF-1.4 dummy'), 'fleet.pdf');
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(2);
    expect(res.body.records[0].sail_number).toBe('USA 12345');
  });

  test('POST /import-pdf without a file returns 400', async () => {
    const res = await request(app).post('/api/v1/admin/boats/import-pdf').set(ADMIN);
    expect(res.status).toBe(400);
  });

  test('confirm inserts new boats and reports conflicts on re-import', async () => {
    const preview = await request(app)
      .post('/api/v1/admin/boats/import-pdf')
      .set(ADMIN)
      .attach('file', Buffer.from('%PDF-1.4 dummy'), 'fleet.pdf');

    const confirm = await request(app)
      .post('/api/v1/admin/boats/import-pdf/confirm')
      .set(ADMIN)
      .send({ records: preview.body.records });
    expect(confirm.status).toBe(200);
    expect(confirm.body.inserted).toHaveLength(2);
    expect(confirm.body.inserted[0].rating_source).toBe('official');
    expect(confirm.body.conflicts).toHaveLength(0);

    // Re-importing the same records yields conflicts, no new inserts.
    const again = await request(app)
      .post('/api/v1/admin/boats/import-pdf/confirm')
      .set(ADMIN)
      .send({ records: preview.body.records });
    expect(again.body.inserted).toHaveLength(0);
    expect(again.body.conflicts).toHaveLength(2);
  });
});

describe('PDF generation', () => {
  test('renderRaceResultsPdf produces a valid PDF buffer', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: true });
    const detail = assembleRaceDetail(await loadRace(club.club_id, race.race_id));
    const buffer = await renderRaceResultsPdf(detail, club);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  test('renderSeriesStandingsPdf produces a valid PDF buffer', async () => {
    const series = (
      await db.query(`INSERT INTO series (club_id, name, season_year) VALUES ($1,'S',2026) RETURNING *`, [
        club.club_id,
      ])
    ).rows[0];
    await createScoredRace(club.club_id, { publish: true, seriesId: series.series_id });
    const data = await computeStandings(club.club_id, series.series_id);
    const buffer = await renderSeriesStandingsPdf(data, club);
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
  });

  test('GET /clubs/:slug/races/:id/pdf returns a PDF', async () => {
    const { race } = await createScoredRace(club.club_id, { publish: true });
    const res = await request(app).get(`/api/v1/clubs/demo/races/${race.race_id}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });
});
