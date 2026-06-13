-- Replace using_spinnaker (inverted default) with no_spinnaker.
-- no_spinnaker = false (default) -> races on phrf_base (spinnaker rating)
-- no_spinnaker = true            -> races on phrf_spinnaker (NS rating)
ALTER TABLE race_entries ADD COLUMN no_spinnaker BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE race_entries SET no_spinnaker = FALSE
