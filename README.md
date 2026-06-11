# EasyPHRF

EasyPHRF is a yacht race management and PHRF results publication web app. Race
committees set up races and fleets, enter finish times, score PHRF Time-on-Time
results (including pursuit starts and self-timed races), publish results and
series standings, and download PDFs — while the public browses published
results and standings. This repository contains the **Phase 1** build.

## Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router v6, Clerk (admin auth)
- **Backend:** Node.js 20+, Express 5, PostgreSQL 16 via `pg`
- **PDF:** `@react-pdf/renderer` (generation), `pdf-parse` (fleet-list import)
- **Tests:** Jest + Supertest (server), Jest + React Testing Library (client)

## Prerequisites

- **Node.js 20+** (developed and tested on Node 22)
- **PostgreSQL 16** (for running the app; the test suite uses an in-memory
  database and needs no Postgres — see [Testing](#running-tests))

## Project structure

```
easyphrf/
  client/                 # React frontend (Vite)
    src/
      api/                # API client
      components/         # Presentational components (ResultsTable, badges, …)
      hooks/              # useApi (Clerk-bound), useAsync
      pages/public/       # Home, RaceResults, SeriesStandings
      pages/admin/        # Dashboard, Boats, Races, RaceSetup, Entries, Results, StartSheet, Series
      __tests__/          # React Testing Library tests
  server/                 # Express backend
    src/
      db/                 # migrations, runner, seed, pool module
      scoring/            # the scoring engine (+ exhaustive tests)
      services/           # raceService, scoringService, seriesService, pdfImport
      pdf/                # @react-pdf/renderer document generators
      routes/             # public + admin/* routers
      middleware/         # auth (Clerk), club context, error handler
      __tests__/          # Supertest API tests + test DB harness
  shared/                 # constants + helpers shared by client and server (CommonJS)
  .env.example
```

## Local development setup

```bash
# 1. Clone and install (uses npm workspaces)
git clone <repo> easyphrf && cd easyphrf
npm install

# 2. Configure environment
cp .env.example .env        # then edit values (DATABASE_URL, Clerk keys, …)
#   The client reads VITE_* vars; copy the Clerk publishable key into client/.env too,
#   or export it in your shell before `npm run dev`.

# 3. Create the database, then run migrations + seed
createdb easyphrf           # or use your existing Postgres 16 instance
npm run migrate             # applies server/src/db/migrations/*.sql
npm run seed                # inserts the 'demo' club

# 4. Run both apps (server on :3001, client on :5173 with an /api proxy)
npm run dev
```

Open:

- **Public results:** http://localhost:5173/
- **Admin:** http://localhost:5173/admin (requires Clerk sign-in)

> **npm cache note:** if `npm install` fails with `EACCES`/`EEXIST` under
> `~/.npm/_cacache`, your global npm cache has root-owned entries from a past
> `sudo` install. Either fix it (`sudo chown -R $(whoami) ~/.npm`) or install
> with a local cache: `npm install --cache ./.npm-cache`.

## Running tests

```bash
npm test                    # runs server then client suites
npm test --workspace=server
npm test --workspace=client
```

The **server suite needs no Postgres**: it runs migrations and queries against
an in-memory Postgres ([`pg-mem`](https://github.com/oguimbal/pg-mem)) wired in
by the test harness (`server/src/__tests__/helpers/testDb.js`). Clerk is never
contacted in tests — an `X-Test-Auth` header simulates an authenticated admin.

## How to add a new club (manual, Phase 1)

Subdomain routing arrives in a later phase. For now, insert a club directly and
address it via the `X-Club-Slug` header (admin) or the `:slug` path (public):

```sql
INSERT INTO clubs (name, slug, timezone)
VALUES ('Bay View Yacht Club', 'bayview', 'America/Los_Angeles');
```

Public URLs then use the slug (e.g. `/api/v1/clubs/bayview/races`); the admin UI
sends `X-Club-Slug: bayview`.

## Implementation notes & intentional deviations

A few places where the spec's prose and formulas disagreed, or where the local
toolchain required adaptation. Each is implemented deliberately and documented
in code:

1. **`races.start_time` column added.** The scoring rules require a race start
   time for simultaneous starts, but the `races` table definition omitted it. It
   was added as `start_time TIMESTAMPTZ`.
2. **Time-on-Time direction.** `corrected = elapsed * 650 / (650 + phrf)`. For a
   fixed elapsed time a *higher* PHRF yields a *lower* (better) corrected time —
   correct PHRF semantics. The spec's prose bullet stated the reverse; the
   formula is authoritative. See `server/src/scoring/index.js`.
3. **Pursuit-start sign.** The reference boat is the slowest (highest PHRF) and
   starts first; the fastest boat starts last. Delay is
   `(referencePHRF - theirPHRF) * factor` so non-reference boats start *after*
   the reference, satisfying both stated ordering rules.
4. **Test database.** No local Postgres/Docker is required for tests; `pg-mem`
   backs the suite. The harness strips `DECIMAL(p,s)` precision args and inline
   `CHECK` constraints (pg-mem limitations) from the in-memory schema only —
   real Postgres runs the migrations verbatim, and app-level validation still
   enforces the enums.
5. **PDF generation under Node 22.** `@react-pdf/renderer` v4 is ESM-only, so it
   is loaded via dynamic `import()` and the server test script runs Jest with
   `--experimental-vm-modules`.
6. **PDF import under Node 22.** `pdf-parse` bundles a 2018-era pdf.js that
   cannot decode PDFs on Node 22. The import service therefore separates binary
   text-extraction (`extractText`, uses `pdf-parse` in production) from the
   record-parsing heuristic (`parseRecordsFromText`, pure and fully unit-tested).
   The endpoint integration test stubs the opaque decode step and feeds canned
   extracted text.
