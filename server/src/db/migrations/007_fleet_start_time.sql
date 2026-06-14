ALTER TABLE fleets ADD COLUMN start_time TIMESTAMPTZ;
UPDATE fleets SET start_time = races.start_time FROM races WHERE fleets.race_id = races.race_id
