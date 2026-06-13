'use strict';

const { zonedTimeToUtc, localDateTimeToUtc, utcToZonedParts } = require('../time');

const LA = 'America/Los_Angeles';

describe('zonedTimeToUtc', () => {
  test('interprets a summer (PDT, UTC-7) wall clock in the club timezone', () => {
    // 18:00 on 2026-07-01 in Los Angeles (PDT) is 01:00 UTC the next day.
    expect(zonedTimeToUtc('2026-07-01', '18:00', LA).toISOString()).toBe('2026-07-02T01:00:00.000Z');
  });

  test('interprets a winter (PST, UTC-8) wall clock in the club timezone', () => {
    expect(zonedTimeToUtc('2026-01-01', '18:00', LA).toISOString()).toBe('2026-01-02T02:00:00.000Z');
  });

  test('does not use the server local timezone', () => {
    // Whatever the host TZ, the same inputs must yield the same instant.
    expect(zonedTimeToUtc('2026-07-01', '09:30', LA).toISOString()).toBe('2026-07-01T16:30:00.000Z');
  });

  test('returns null for empty input', () => {
    expect(zonedTimeToUtc('2026-07-01', '', LA)).toBeNull();
    expect(zonedTimeToUtc('', '18:00', LA)).toBeNull();
  });
});

describe('localDateTimeToUtc', () => {
  test('interprets a naive datetime-local string in the club timezone', () => {
    expect(localDateTimeToUtc('2026-07-01T19:30', LA).toISOString()).toBe('2026-07-02T02:30:00.000Z');
  });

  test('passes through a string that already carries a zone offset', () => {
    expect(localDateTimeToUtc('2026-07-02T02:30:00Z', LA).toISOString()).toBe('2026-07-02T02:30:00.000Z');
  });

  test('returns null for empty/missing input', () => {
    expect(localDateTimeToUtc('', LA)).toBeNull();
    expect(localDateTimeToUtc(null, LA)).toBeNull();
  });
});

describe('utcToZonedParts', () => {
  test('renders an instant as club-local date and time of day', () => {
    expect(utcToZonedParts('2026-07-02T01:00:00.000Z', LA)).toEqual({
      date: '2026-07-01',
      time: '18:00:00',
      dateTime: '2026-07-01T18:00:00',
    });
  });

  test('round-trips with zonedTimeToUtc', () => {
    const instant = zonedTimeToUtc('2026-03-15', '07:45', LA);
    expect(utcToZonedParts(instant, LA).time).toBe('07:45:00');
  });

  test('includes seconds in time and dateTime fields', () => {
    // 18:30:45 LA summer = 01:30:45 UTC next day
    const instant = zonedTimeToUtc('2026-07-01', '18:30:45', LA);
    const parts = utcToZonedParts(instant, LA);
    expect(parts.time).toBe('18:30:45');
    expect(parts.dateTime).toBe('2026-07-01T18:30:45');
  });

  test('returns nulls for empty input', () => {
    expect(utcToZonedParts(null, LA)).toEqual({ date: null, time: null, dateTime: null });
  });
});
