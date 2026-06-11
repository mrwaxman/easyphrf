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
  const spin = cols[cols.length - 1];
  const base = cols[cols.length - 2];
  if (!isInt(base) || !isInt(spin)) return null;

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
    phrf_base: parseInt(base, 10),
    phrf_spinnaker: parseInt(spin, 10),
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
    const res = await db.query(
      `INSERT INTO boats
         (club_id, sail_number, boat_name, model, skipper_name, phrf_base, phrf_spinnaker, rating_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'official')
       RETURNING *`,
      [clubId, r.sail_number, r.boat_name, r.model ?? null, r.skipper_name, r.phrf_base, r.phrf_spinnaker]
    );
    inserted.push(res.rows[0]);
  }

  return { inserted, conflicts };
}

module.exports = { parsePhrfPdf, parseRecordsFromText, extractText, confirmImport, rowToRecord };
