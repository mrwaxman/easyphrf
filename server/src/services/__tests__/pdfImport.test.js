'use strict';

const { parseRecordsFromText, rowToRecord } = require('../pdfImport');

const SAMPLE = [
  'PHRF SoCal Fleet List 2026',
  'Sail        Boat            Model      Skipper         Base  Spin',
  'USA 12345   Blue Streak     J/105      Jane Skipper    84    72',
  'USA 678     Wind Dancer     Beneteau   Bob Helm        120   108',
  'Notes: ratings effective March 2026',
].join('\n');

describe('parseRecordsFromText', () => {
  test('extracts data rows and ignores headers/footers', () => {
    const { records, unparsedLines } = parseRecordsFromText(SAMPLE);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      sail_number: 'USA 12345',
      boat_name: 'Blue Streak',
      model: 'J/105',
      skipper_name: 'Jane Skipper',
      phrf_base: 84,
      phrf_spinnaker: 72,
    });
    expect(records[1].sail_number).toBe('USA 678');
    expect(records[1].phrf_base).toBe(120);
    // The title, column header, and notes line are not data rows.
    expect(unparsedLines.length).toBe(3);
  });

  test('handles empty input', () => {
    expect(parseRecordsFromText('')).toEqual({ records: [], unparsedLines: [], rawText: '' });
  });
});

describe('rowToRecord', () => {
  test('rejects rows with too few columns', () => {
    expect(rowToRecord(['USA 1', 'Boat', '84'])).toBeNull();
  });
  test('rejects rows whose trailing columns are not integer ratings', () => {
    expect(rowToRecord(['USA 1', 'Boat', 'Model', 'Skip', 'fast', 'slow'])).toBeNull();
  });
  test('accepts a well-formed row', () => {
    const r = rowToRecord(['USA 1', 'Boat', 'Model', 'Skip', '100', '88']);
    expect(r).toMatchObject({ sail_number: 'USA 1', phrf_base: 100, phrf_spinnaker: 88 });
  });
});
