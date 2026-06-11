'use strict';

/**
 * Shared constants and small pure helpers used by both the server and client.
 * Authored in CommonJS so the Express server can `require` it directly and
 * Vite/Jest can consume it on the client via interop.
 */

// --- Enumerations (mirror the database CHECK constraints) ---

const SCORING_METHODS = ['time_on_time', 'time_on_distance'];
const SPINNAKER_MODES = ['per_race', 'season_commitment'];
const START_TYPES = ['simultaneous', 'pursuit', 'self_timed'];
const SELF_TIMED_MODES = ['fully_independent', 'rc_finish_self_start'];
const RACE_STATUSES = ['draft', 'open', 'published', 'revised'];
const FLEET_TYPES = ['phrf', 'one_design'];
const FLEET_SPINNAKER_POLICIES = ['allowed', 'not_allowed', 'optional'];
const RATING_SOURCES = ['official', 'inferred'];
const FINISH_STATUSES = ['finished', 'dnf', 'dns', 'dsq', 'raf'];

// A finisher is the only status that earns a corrected time / a real place.
const FINISHED = 'finished';
const NON_FINISH_STATUSES = ['dnf', 'dns', 'dsq', 'raf'];

// Time-on-time base constant. Corrected = elapsed * TOT_BASE / (TOT_BASE + phrf).
const TOT_BASE = 650;

// Default pursuit-start scaling: spread the fleet across a nominal 2-hour race.
const DEFAULT_PURSUIT_RACE_SECONDS = 2 * 60 * 60;

/** Human-readable labels for finish statuses (used in tables / PDFs). */
const FINISH_STATUS_LABELS = {
  finished: 'Finished',
  dnf: 'DNF',
  dns: 'DNS',
  dsq: 'DSQ',
  raf: 'RAF',
};

/** Human-readable labels for race statuses. */
const RACE_STATUS_LABELS = {
  draft: 'Draft',
  open: 'Open',
  published: 'Published',
  revised: 'Revised',
};

/**
 * Format a number of seconds as H:MM:SS (or M:SS when under an hour).
 * Returns '—' for null/undefined. Used by tables and PDFs.
 */
function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const rounded = Math.round(Number(totalSeconds));
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${m}:${ss}`;
}

module.exports = {
  SCORING_METHODS,
  SPINNAKER_MODES,
  START_TYPES,
  SELF_TIMED_MODES,
  RACE_STATUSES,
  FLEET_TYPES,
  FLEET_SPINNAKER_POLICIES,
  RATING_SOURCES,
  FINISH_STATUSES,
  FINISHED,
  NON_FINISH_STATUSES,
  TOT_BASE,
  DEFAULT_PURSUIT_RACE_SECONDS,
  FINISH_STATUS_LABELS,
  RACE_STATUS_LABELS,
  formatDuration,
};
