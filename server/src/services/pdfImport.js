'use strict';

const db = require('../db');

// Require the library entrypoint directly: the package's index.js runs a debug
// block that reads a sample file from disk when loaded as the main module,
// which throws in some environments.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

/**
 * Extract raw text from a PDF buffer using pdf-parse. Isolated so the parsing
 * heuristic can be unit-tested independently of binary PDF decoding (and so the
 * decode step can be stubbed in integration tests).
 */
async function extractText(buffer) {
  const data = await pdfParse(buffer);
  return data.text || '';
}

/**
 * Parse extracted PHRF-fleet-list text into candidate boat records.
 *
 * Expected row layout (columns separated by runs of whitespace), e.g.:
 *
 *   USA 12345   Blue Streak     J/105      Jane Skipper    84   72
 *   sail-number boat-name        model      skipper         base spin
 *
 * Heuristics: a line is treated as a data row when, after splitting on runs of
 * 2+ spaces, it has at least 5 columns whose final two are integers (base then
 * spinnaker rating). Header/footer lines are ignored.
 */
function parseRecordsFromText(rawText) {
  const lines = (rawText || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const records = [];
  const unparsedLines = [];

  for (const line of lines) {
    const cols = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    const parsed = rowToRecord(cols);
    if (parsed) {
      records.push(parsed);
    } else {
      unparsedLines.push(line);
    }
  }

  return { records, unparsedLines, rawText };
}

/**
 * Parse a PHRF SoCal-style fleet list PDF into candidate boat records — the
 * preview the RC reviews before confirming.
 *
 * @param {Buffer} buffer Raw PDF bytes.
 * @returns {Promise<{records: object[], unparsedLines: string[], rawText: string}>}
 */
async function parsePhrfPdf(buffer) {
  const rawText = await extractText(buffer);
  return parseRecordsFromText(rawText);
}

const isInt = (s) => /^-?\d+$/.test(s);

/** Map a split row to a record, or null if it is not a data row. */
function rowToRecord(cols) {
  if (cols.length < 5) return null;
  // SoCal fleet lists print the two ratings as "Base  Spin": the PDF "Base"
  // column is the non-spinnaker (slower) rating and the "Spin" column is the
  // with-spinnaker (faster) rating. Our convention is the reverse — phrf_base is
  // the faster spinnaker rating and phrf_spinnaker (= phrf_base + spinnaker_offset)
  // is the slower non-spin rating. So the PDF's Spin column becomes phrf_base and
  // the offset is the gap up to its Base column.
  const pdfSpin = cols[cols.length - 1]; // with-spinnaker rating (faster)
  const pdfBase = cols[cols.length - 2]; // non-spinnaker rating (slower)
  if (!isInt(pdfSpin) || !isInt(pdfBase)) return null;

  const phrf_base = parseInt(pdfSpin, 10);
  const spinnaker_offset = parseInt(pdfBase, 10) - phrf_base;

  const sail_number = cols[0];
  // Header rows often start with a non-sail label; require the sail token to
  // contain a digit (e.g. "USA 12345" -> "USA", "12345" depends on splitting;
  // sail numbers in these lists always include digits somewhere in col 0/1).
  const head = cols.slice(0, cols.length - 2);
  const boat_name = head[1] || '';
  const model = head[2] || null;
  const skipper_name = head[3] || head[2] || '';

  return {
    sail_number,
    boat_name,
    model,
    skipper_name,
    phrf_base,
    spinnaker_offset,
    phrf_spinnaker: phrf_base + spinnaker_offset,
  };
}

/**
 * Insert reviewed records for a club. Records whose sail number already exists
 * are not inserted; they are returned in `conflicts` for the RC to resolve.
 * Imported boats get rating_source = 'official'.
 *
 * @returns {Promise<{inserted: object[], conflicts: object[]}>}
 */
async function confirmImport(clubId, records) {
  const inserted = [];
  const conflicts = [];

  for (const r of records) {
    const existing = await db.query(
      'SELECT boat_id, sail_number, boat_name FROM boats WHERE club_id = $1 AND sail_number = $2',
      [clubId, r.sail_number]
    );
    if (existing.rows.length > 0) {
      conflicts.push({ incoming: r, existing: existing.rows[0] });
      continue;
    }
    // phrf_spinnaker is always derived from base + offset, never trusted from
    // the (RC-editable) preview payload.
    const spinnakerOffset = r.spinnaker_offset != null ? Number(r.spinnaker_offset) : 0;
    const phrfSpinnaker = Number(r.phrf_base) + spinnakerOffset;
    const res = await db.query(
      `INSERT INTO boats
         (club_id, sail_number, boat_name, model, skipper_name, phrf_base, spinnaker_offset, phrf_spinnaker, rating_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'official')
       RETURNING *`,
      [clubId, r.sail_number, r.boat_name, r.model ?? null, r.skipper_name, r.phrf_base, spinnakerOffset, phrfSpinnaker]
    );
    inserted.push(res.rows[0]);
  }

  return { inserted, conflicts };
}

module.exports = { parsePhrfPdf, parseRecordsFromText, extractText, confirmImport, rowToRecord };
