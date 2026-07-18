'use strict';

require('dotenv').config();
const db = require('./index');

/**
 * Seed baseline data. Idempotent: safe to run repeatedly. Pass a pool to
 * target a specific database (tests pass a pg-mem pool).
 *
 * Single-tenant: seeds the one club the app serves (Buccaneer Yacht Club).
 * The slug must match SINGLE_CLUB_SLUG used by the club-context middleware.
 */
async function seed(customPool) {
  if (customPool) db.configure(customPool);

  const existing = await db.query('SELECT club_id FROM clubs WHERE slug = $1', ['buccaneer']);
  if (existing.rows.length === 0) {
    await db.query(
      `INSERT INTO clubs (name, slug, timezone)
       VALUES ($1, $2, $3)`,
      ['Buccaneer Yacht Club', 'buccaneer', 'America/Los_Angeles']
    );
  }

  const club = await db.query('SELECT * FROM clubs WHERE slug = $1', ['buccaneer']);
  return club.rows[0];
}

if (require.main === module) {
  seed()
    .then((club) => {
      console.log(`Seeded club: ${club.name} (${club.slug})`);
      return db.close();
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { seed };
