-- Per-race expected duration for pursuit-start scaling. NULL means use DEFAULT_PURSUIT_RACE_SECONDS.
ALTER TABLE races ADD COLUMN expected_duration_minutes INTEGER
