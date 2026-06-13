'use strict';

/**
 * Timezone-aware wall-clock <-> instant conversion.
 *
 * Race times are entered by admins as a local wall-clock time of day and must
 * be interpreted in the *club's* timezone (clubs.timezone), never the server's
 * local timezone and never naive UTC. These helpers do that conversion without
 * pulling in a date library, using Intl.DateTimeFormat for the zone offset.
 */

/**
 * Offset (ms) between a club-zone wall clock and UTC at a given instant, such
 * that `localWallClockAsIfUTC = utc + offset`. Positive east of UTC.
 */
function zoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - date.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to the corresponding UTC Date.
 * Corrects twice so instants near a DST transition resolve correctly.
 */
function wallClockToUtc(year, month, day, hour, minute, second, timeZone) {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = zoneOffsetMs(new Date(guessMs), timeZone);
  let utcMs = guessMs - offset;
  const offset2 = zoneOffsetMs(new Date(utcMs), timeZone);
  if (offset2 !== offset) utcMs = guessMs - offset2;
  return new Date(utcMs);
}

/** True when a string already carries timezone info (trailing Z or ±HH:MM). */
function hasZoneInfo(str) {
  return /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(str);
}

/**
 * Normalize a calendar date to 'YYYY-MM-DD'. Accepts a 'YYYY-MM-DD' string, an
 * ISO string, or a Date stored at UTC midnight (how DATE columns deserialize).
 */
function toDateOnly(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Build a UTC Date from a calendar date ("YYYY-MM-DD") and a time of day
 * ("HH:mm" or "HH:mm:ss") interpreted in `timeZone`. Returns null on empty
 * input.
 */
function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  if (!dateStr || !timeStr) return null;
  const normalized = toDateOnly(dateStr);
  if (!normalized) return null;
  const [y, m, d] = normalized.split('-').map(Number);
  const [hh, mm, ss = 0] = String(timeStr).split(':').map(Number);
  if ([y, m, d, hh, mm].some(Number.isNaN)) return null;
  return wallClockToUtc(y, m, d, hh, mm, ss, timeZone);
}

/**
 * Interpret a datetime-local string ("YYYY-MM-DDTHH:mm[:ss]") in `timeZone`.
 * Strings that already carry an offset/Z are absolute and pass through. Returns
 * null for empty input.
 */
function localDateTimeToUtc(value, timeZone) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  const str = String(value);
  if (hasZoneInfo(str)) return new Date(str);
  const [datePart, timePart = '00:00'] = str.split('T');
  return zonedTimeToUtc(datePart, timePart, timeZone);
}

/**
 * Render an instant as its wall-clock parts in `timeZone`:
 *   { date: 'YYYY-MM-DD', time: 'HH:mm:ss', dateTime: 'YYYY-MM-DDTHH:mm:ss' }
 * Returns nulls for empty/invalid input.
 */
function utcToZonedParts(value, timeZone) {
  const empty = { date: null, time: null, dateTime: null };
  if (value === null || value === undefined || value === '') return empty;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return empty;
  // en-CA renders ISO-style YYYY-MM-DD date parts.
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(d)) parts[p.type] = p.value;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${hour}:${parts.minute}:${parts.second}`;
  return { date, time, dateTime: `${date}T${time}` };
}

module.exports = {
  zonedTimeToUtc,
  localDateTimeToUtc,
  utcToZonedParts,
  wallClockToUtc,
  toDateOnly,
};
