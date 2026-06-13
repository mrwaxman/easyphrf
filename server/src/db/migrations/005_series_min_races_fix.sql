ALTER TABLE series ALTER COLUMN min_races_to_qualify DROP NOT NULL;
ALTER TABLE series ALTER COLUMN min_races_to_qualify DROP DEFAULT;
UPDATE series SET min_races_to_qualify = NULL
