-- EasyPHRF initial schema. Statements are separated by semicolons and run
-- individually by the migration runner, so no statement may contain an
-- embedded semicolon (none do).

CREATE TABLE clubs (
  club_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  scoring_method  TEXT NOT NULL DEFAULT 'time_on_time' CHECK (scoring_method IN ('time_on_time', 'time_on_distance')),
  spinnaker_mode  TEXT NOT NULL DEFAULT 'per_race' CHECK (spinnaker_mode IN ('per_race', 'season_commitment')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE boats (
  boat_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          UUID NOT NULL REFERENCES clubs(club_id),
  sail_number      TEXT NOT NULL,
  boat_name        TEXT NOT NULL,
  model            TEXT,
  skipper_name     TEXT NOT NULL,
  phrf_base        INTEGER NOT NULL,
  phrf_spinnaker   INTEGER NOT NULL,
  spinnaker_offset INTEGER NOT NULL DEFAULT 0,
  rating_source    TEXT NOT NULL DEFAULT 'official' CHECK (rating_source IN ('official', 'inferred')),
  rating_notes     TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (club_id, sail_number)
);

CREATE TABLE series (
  series_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          UUID NOT NULL REFERENCES clubs(club_id),
  name             TEXT NOT NULL,
  season_year      INTEGER NOT NULL,
  throwout_rule    TEXT,
  spinnaker_mode   TEXT NOT NULL DEFAULT 'per_race' CHECK (spinnaker_mode IN ('per_race', 'season_commitment')),
  notes            TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE races (
  race_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          UUID NOT NULL REFERENCES clubs(club_id),
  series_id        UUID REFERENCES series(series_id),
  name             TEXT NOT NULL,
  race_date        DATE NOT NULL,
  start_type       TEXT NOT NULL CHECK (start_type IN ('simultaneous', 'pursuit', 'self_timed')),
  self_timed_mode  TEXT CHECK (self_timed_mode IN ('fully_independent', 'rc_finish_self_start')),
  race_distance    DECIMAL(6,2),
  time_limit_secs  INTEGER,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'published', 'revised')),
  revision_notes   TEXT,
  revised_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  published_at     TIMESTAMPTZ,
  start_time       TIMESTAMPTZ
);

CREATE TABLE fleets (
  fleet_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id          UUID NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  fleet_type       TEXT NOT NULL CHECK (fleet_type IN ('phrf', 'one_design')),
  phrf_min         INTEGER,
  phrf_max         INTEGER,
  uses_spinnaker   TEXT NOT NULL DEFAULT 'optional' CHECK (uses_spinnaker IN ('allowed', 'not_allowed', 'optional'))
);

CREATE TABLE race_entries (
  entry_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id              UUID NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
  fleet_id             UUID NOT NULL REFERENCES fleets(fleet_id),
  boat_id              UUID NOT NULL REFERENCES boats(boat_id),
  phrf_override        INTEGER,
  phrf_override_note   TEXT,
  using_spinnaker      BOOLEAN NOT NULL DEFAULT FALSE,
  self_start_time      TIMESTAMPTZ,
  finish_time          TIMESTAMPTZ,
  elapsed_seconds      INTEGER,
  corrected_seconds    INTEGER,
  finish_status        TEXT NOT NULL DEFAULT 'finished' CHECK (finish_status IN ('finished', 'dnf', 'dns', 'dsq', 'raf')),
  fleet_place          INTEGER,
  overall_place        INTEGER,
  points               DECIMAL(6,2),
  UNIQUE (race_id, boat_id)
);

CREATE TABLE series_standings (
  standing_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id        UUID NOT NULL REFERENCES series(series_id) ON DELETE CASCADE,
  boat_id          UUID NOT NULL REFERENCES boats(boat_id),
  fleet_id         UUID NOT NULL REFERENCES fleets(fleet_id),
  total_points     DECIMAL(8,2),
  races_sailed     INTEGER NOT NULL DEFAULT 0,
  throwouts        JSONB DEFAULT '[]',
  rank             INTEGER,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (series_id, boat_id)
);

CREATE INDEX idx_boats_club ON boats(club_id);
CREATE INDEX idx_series_club ON series(club_id);
CREATE INDEX idx_races_club ON races(club_id);
CREATE INDEX idx_races_series ON races(series_id);
CREATE INDEX idx_fleets_race ON fleets(race_id);
CREATE INDEX idx_entries_race ON race_entries(race_id);
CREATE INDEX idx_entries_fleet ON race_entries(fleet_id);
CREATE INDEX idx_entries_boat ON race_entries(boat_id);
CREATE INDEX idx_standings_series ON series_standings(series_id)
