'use strict';

const { scoreSeriesStandings } = require('../index');

const DEFAULT_FLEET = 'F';

/**
 * Build a race result. Each line is [boatId, placeOrStatus].
 * fleetId defaults to DEFAULT_FLEET; fleetName defaults to fleetId.
 */
function race(raceId, raceDate, lines, fleetSize, fleetId = DEFAULT_FLEET) {
  const size = fleetSize ?? lines.length;
  return {
    raceId,
    raceDate,
    results: lines.map(([boatId, placeOrStatus]) => ({
      boatId,
      fleetId,
      fleetName: fleetId,
      fleetSize: size,
      finishStatus: typeof placeOrStatus === 'string' ? placeOrStatus : 'finished',
      fleetPlace: typeof placeOrStatus === 'number' ? placeOrStatus : null,
    })),
  };
}

// Structured series configs used across tests.
const NO_THROWOUTS = { throwouts_enabled: false };
const ONE_TIER     = { throwouts_enabled: true,  throwout_tiers: [{ after_races: 4, throwouts: 1 }] };
const TWO_TIERS    = { throwouts_enabled: true,  throwout_tiers: [{ after_races: 4, throwouts: 1 }, { after_races: 8, throwouts: 2 }] };

// ─── Throwout math — structured tiers ────────────────────────────────────────

describe('throwout math — structured tiers', () => {
  // ── Throwouts OFF ────────────────────────────────────────────────────────────
  test('throwouts OFF: every race counts, none dropped', () => {
    // b1: R1=1 R2=1 R3=4 R4=1 in fleet-of-5. With throwouts off, all 4 count.
    // Expected total = 1+1+4+1 = 7 (nothing dropped)
    const races = [
      race('r1', '2026-05-01', [['b1', 1]], 5),
      race('r2', '2026-05-08', [['b1', 1]], 5),
      race('r3', '2026-05-15', [['b1', 4]], 5),
      race('r4', '2026-05-22', [['b1', 1]], 5),
    ];
    const [s] = scoreSeriesStandings(NO_THROWOUTS, races);
    expect(s.total_points).toBe(7);
    expect(s.throwouts).toHaveLength(0);
    expect(s.perRace.every((p) => !p.dropped)).toBe(true);
  });

  // ── Single tier — hand-computed, auditable table ─────────────────────────────
  test('single tier (1 throwout after 4 races): worst race dropped', () => {
    // b1: R1=1 R2=1 R3=4 R4=1 in fleet-of-5.
    // Threshold reached at 4 races → drop 1 worst.
    // Worst = R3=4. Kept: R1=1 R2=1 R4=1. Expected total = 3.
    const races = [
      race('r1', '2026-05-01', [['b1', 1]], 5),
      race('r2', '2026-05-08', [['b1', 1]], 5),
      race('r3', '2026-05-15', [['b1', 4]], 5),
      race('r4', '2026-05-22', [['b1', 1]], 5),
    ];
    const [s] = scoreSeriesStandings(ONE_TIER, races);

    console.table([{
      boat:             'b1',
      race_scores:      'R1=1 R2=1 R3=4 R4=1',
      tier:             '1 drop after 4 races',
      expected_dropped: 'R3=4',
      expected_total:   3,
      actual_dropped:   `${s.throwouts[0]?.raceId}=${s.throwouts[0]?.points}`,
      actual_total:     s.total_points,
      ok:               s.total_points === 3 && s.throwouts[0]?.raceId === 'r3' ? '✓' : '✗',
    }]);

    expect(s.races_sailed).toBe(4);
    expect(s.total_points).toBe(3);
    expect(s.throwouts).toHaveLength(1);
    expect(s.throwouts[0]).toMatchObject({ raceId: 'r3', points: 4 });
    expect(s.perRace.find((p) => p.raceId === 'r3').dropped).toBe(true);
    expect(s.perRace.filter((p) => !p.dropped).reduce((n, p) => n + p.points, 0)).toBe(3);
  });

  // ── Below threshold → no throwout ────────────────────────────────────────────
  test('below threshold (<4 races): no throwout applied', () => {
    // b1 has only 3 races. Tier requires ≥4 → zero drops. All count.
    // b1: R1=1 R2=5 R3=1. Expected total = 7.
    const races = [
      race('r1', '2026-05-01', [['b1', 1]], 5),
      race('r2', '2026-05-08', [['b1', 5]], 5),
      race('r3', '2026-05-15', [['b1', 1]], 5),
    ];
    const [s] = scoreSeriesStandings(ONE_TIER, races);
    expect(s.races_sailed).toBe(3);
    expect(s.throwouts).toHaveLength(0);
    expect(s.total_points).toBe(7);
  });

  // ── Two tiers ────────────────────────────────────────────────────────────────
  test('two tiers (1 after 4, 2 after 8): with 8 races, two worst dropped', () => {
    // b1: six 1s (R1–R6), R7=5, R8=4. Fleet-of-6 for all races.
    // 8 races → tier 2 applies → drop 2 worst.
    // Worst two: R7=5, R8=4. Kept: six 1s. Expected total = 6.
    const races = [
      race('r1', '2026-05-01', [['b1', 1]], 6),
      race('r2', '2026-05-02', [['b1', 1]], 6),
      race('r3', '2026-05-03', [['b1', 1]], 6),
      race('r4', '2026-05-04', [['b1', 1]], 6),
      race('r5', '2026-05-05', [['b1', 1]], 6),
      race('r6', '2026-05-06', [['b1', 1]], 6),
      race('r7', '2026-05-07', [['b1', 5]], 6),
      race('r8', '2026-05-08', [['b1', 4]], 6),
    ];
    const [s8] = scoreSeriesStandings(TWO_TIERS, races);
    expect(s8.races_sailed).toBe(8);
    expect(s8.total_points).toBe(6);
    expect(s8.throwouts.map((t) => t.points).sort((a, b) => a - b)).toEqual([4, 5]);

    // With only 4 races, tier 1 applies → only 1 drop.
    const [s4] = scoreSeriesStandings(TWO_TIERS, races.slice(0, 4));
    expect(s4.throwouts).toHaveLength(1);
  });

  // ── Migration fallback ───────────────────────────────────────────────────────
  test('migration fallback: throwouts_enabled=false → all races count regardless of tiers field', () => {
    // Simulates a series row that existed before the structured-throwouts migration.
    // After migration 006, such rows have throwouts_enabled=false (the safe default).
    // The engine must not apply any drops.
    const series = { throwouts_enabled: false, throwout_tiers: [{ after_races: 4, throwouts: 1 }] };
    const races = [
      race('r1', '2026-05-01', [['b1', 1]], 5),
      race('r2', '2026-05-08', [['b1', 1]], 5),
      race('r3', '2026-05-15', [['b1', 4]], 5),
      race('r4', '2026-05-22', [['b1', 1]], 5),
    ];
    const [s] = scoreSeriesStandings(series, races);
    expect(s.total_points).toBe(7); // 1+1+4+1, nothing dropped
    expect(s.throwouts).toHaveLength(0);
  });
});

// ─── Full standings engine ────────────────────────────────────────────────────

describe('scoreSeriesStandings', () => {
  test('3-race series, 4 boats, no throwouts: totals and ranks', () => {
    const races = [
      race('r1', '2026-05-01', [['b1', 1], ['b2', 2], ['b3', 3], ['b4', 4]]),
      race('r2', '2026-05-08', [['b1', 2], ['b2', 1], ['b3', 4], ['b4', 3]]),
      race('r3', '2026-05-15', [['b1', 1], ['b2', 3], ['b3', 2], ['b4', 4]]),
    ];
    const standings = scoreSeriesStandings(NO_THROWOUTS, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));

    expect(byBoat.b1.total_points).toBe(4);
    expect(byBoat.b2.total_points).toBe(6);
    expect(byBoat.b3.total_points).toBe(9);
    expect(byBoat.b4.total_points).toBe(11);

    expect(byBoat.b1.rank).toBe(1);
    expect(byBoat.b2.rank).toBe(2);
    expect(byBoat.b3.rank).toBe(3);
    expect(byBoat.b4.rank).toBe(4);

    expect(byBoat.b1.races_sailed).toBe(3);
    expect(byBoat.b1.throwouts).toEqual([]);
  });

  test('DNF scores fleetSize + 1 points', () => {
    const races = [race('r1', '2026-05-01', [['b1', 'dnf']], 6)];
    const [s] = scoreSeriesStandings(NO_THROWOUTS, races);
    expect(s.total_points).toBe(7); // 6 entries + 1
  });

  test('A8.1 then A8.2: equal totals resolved by count-of-places, then most-recent race', () => {
    // b1=[1,3] sorted [1,3], b2=[3,1] sorted [1,3] — A8.1 equal.
    // A8.2: R2 b1=3, b2=1 — b2 wins.
    const races = [
      race('r1', '2026-05-01', [['b1', 1], ['b2', 3]]),
      race('r2', '2026-05-08', [['b1', 3], ['b2', 1]]),
    ];
    const standings = scoreSeriesStandings(NO_THROWOUTS, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));
    expect(byBoat.b1.total_points).toBe(4);
    expect(byBoat.b2.total_points).toBe(4);
    expect(byBoat.b2.rank).toBe(1);
    expect(byBoat.b1.rank).toBe(2);
  });

  test('A8.1 breaks tie without needing A8.2', () => {
    // b1 total=5 (1+1+3), b2 total=5 (1+2+2).
    // A8.1: b1 sorted kept [1,1,3]; b2 sorted kept [1,2,2].
    // Position 1: b1=1 < b2=2 → b1 wins.
    const races = [
      race('r1', '2026-05-01', [['b1', 1], ['b2', 1]]),
      race('r2', '2026-05-08', [['b1', 1], ['b2', 2]]),
      race('r3', '2026-05-15', [['b1', 3], ['b2', 2]]),
    ];
    const standings = scoreSeriesStandings(NO_THROWOUTS, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));
    expect(byBoat.b1.total_points).toBe(5);
    expect(byBoat.b2.total_points).toBe(5);
    expect(byBoat.b1.rank).toBe(1);
    expect(byBoat.b2.rank).toBe(2);
  });

  test('minimum races: boats below threshold are unqualified with rank null', () => {
    const races = [
      race('r1', '2026-05-01', [['P', 1], ['Q', 2]]),
      race('r2', '2026-05-08', [['P', 1], ['Q', 2]]),
      race('r3', '2026-05-15', [['P', 1]]),
    ];
    const standings = scoreSeriesStandings({ ...NO_THROWOUTS, min_races_to_qualify: 3 }, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));

    expect(byBoat.P.qualified).toBe(true);
    expect(byBoat.P.rank).toBe(1);
    expect(byBoat.Q.qualified).toBe(false);
    expect(byBoat.Q.rank).toBeNull();
  });

  test('per-fleet: boats in different fleets are tracked separately', () => {
    const r1 = {
      raceId: 'r1',
      raceDate: '2026-05-01',
      results: [
        { boatId: 'a1', fleetId: 'FA', fleetName: 'A Fleet', finishStatus: 'finished', fleetPlace: 1, fleetSize: 2 },
        { boatId: 'a2', fleetId: 'FA', fleetName: 'A Fleet', finishStatus: 'finished', fleetPlace: 2, fleetSize: 2 },
        { boatId: 'b1', fleetId: 'FB', fleetName: 'B Fleet', finishStatus: 'finished', fleetPlace: 1, fleetSize: 2 },
        { boatId: 'b2', fleetId: 'FB', fleetName: 'B Fleet', finishStatus: 'finished', fleetPlace: 2, fleetSize: 2 },
      ],
    };
    const standings = scoreSeriesStandings({}, [r1]);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));

    expect(byBoat.a1.total_points).toBe(1);
    expect(byBoat.a2.total_points).toBe(2);
    expect(byBoat.b1.total_points).toBe(1);
    expect(byBoat.b2.total_points).toBe(2);
    expect(byBoat.a1.fleetId).toBe('FA');
    expect(byBoat.b1.fleetId).toBe('FB');
  });

  // ─── Comprehensive worked example ────────────────────────────────────────────
  //
  // Series: throwouts_enabled=true, tiers=[1 after 4], min_races_to_qualify=3
  //
  // Boats: alpha, bravo, charlie, delta
  //
  //   R1 2026-05-01 (4 entries): alpha=1, bravo=2, charlie=3, delta=4
  //   R2 2026-05-08 (4 entries): bravo=1, alpha=2, charlie=3, delta=4
  //   R3 2026-05-15 (3 entries): alpha=1, bravo=2, charlie=DNF  [delta missed]
  //   R4 2026-05-22 (4 entries): bravo=1, alpha=2, charlie=3,   delta=DNF
  //   R5 2026-05-29 (4 entries): alpha=1, bravo=2, charlie=3,   delta=4
  //
  //  alpha:   [1,2,1,2,1] sailed=5 → drop R4=2  → kept [1,2,1,1]=5
  //  bravo:   [2,1,2,1,2] sailed=5 → drop R5=2  → kept [2,1,2,1]=6
  //  charlie: [3,3,4,3,3] sailed=5 → drop R3=4  → kept [3,3,3,3]=12
  //  delta:   [4,4,—,5,4] sailed=4 → drop R4=5  → kept [4,4,4]=12
  //
  //  Tie charlie/delta at 12: A8.1 charlie[3,3,3,3] vs delta[4,4,4] → charlie wins
  //
  //  Final: alpha=1, bravo=2, charlie=3, delta=4
  // ────────────────────────────────────────────────────────────────────────────

  test('worked 5-race example: totals, throwouts, DNF, A8.1 tiebreak, missed race', () => {
    const SERIES = { ...ONE_TIER, min_races_to_qualify: 3 };

    const races = [
      race('r1', '2026-05-01', [['alpha', 1], ['bravo', 2], ['charlie', 3], ['delta', 4]]),
      race('r2', '2026-05-08', [['bravo', 1], ['alpha', 2], ['charlie', 3], ['delta', 4]]),
      race('r3', '2026-05-15', [['alpha', 1], ['bravo', 2], ['charlie', 'dnf']], 3),
      race('r4', '2026-05-22', [['bravo', 1], ['alpha', 2], ['charlie', 3], ['delta', 'dnf']], 4),
      race('r5', '2026-05-29', [['alpha', 1], ['bravo', 2], ['charlie', 3], ['delta', 4]]),
    ];

    const standings = scoreSeriesStandings(SERIES, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));

    const EXPECTED = {
      alpha:   { total: 5,  rank: 1, throwoutRace: 'r4', throwoutPts: 2 },
      bravo:   { total: 6,  rank: 2, throwoutRace: 'r5', throwoutPts: 2 },
      charlie: { total: 12, rank: 3, throwoutRace: 'r3', throwoutPts: 4 },
      delta:   { total: 12, rank: 4, throwoutRace: 'r4', throwoutPts: 5 },
    };
    console.table(
      Object.entries(EXPECTED).map(([boat, exp]) => {
        const s = byBoat[boat];
        return {
          boat,
          exp_total:  exp.total,
          act_total:  s ? s.total_points : 'MISSING',
          total_ok:   s && s.total_points === exp.total ? '✓' : '✗',
          exp_rank:   exp.rank,
          act_rank:   s ? s.rank : 'MISSING',
          rank_ok:    s && s.rank === exp.rank ? '✓' : '✗',
          throwout:   s && s.throwouts[0]?.raceId === exp.throwoutRace ? '✓' : '✗',
        };
      })
    );

    expect(byBoat.alpha.total_points).toBe(5);
    expect(byBoat.bravo.total_points).toBe(6);
    expect(byBoat.charlie.total_points).toBe(12);
    expect(byBoat.delta.total_points).toBe(12);

    expect(byBoat.alpha.rank).toBe(1);
    expect(byBoat.bravo.rank).toBe(2);
    expect(byBoat.charlie.rank).toBe(3);
    expect(byBoat.delta.rank).toBe(4);

    expect(byBoat.alpha.throwouts[0]).toMatchObject({ raceId: 'r4', points: 2 });
    expect(byBoat.bravo.throwouts[0]).toMatchObject({ raceId: 'r5', points: 2 });
    expect(byBoat.charlie.throwouts[0]).toMatchObject({ raceId: 'r3', points: 4 });
    expect(byBoat.delta.throwouts[0]).toMatchObject({ raceId: 'r4', points: 5 });

    // DNF penalties
    expect(byBoat.charlie.perRace.find((p) => p.raceId === 'r3').points).toBe(4); // fleet-of-3
    expect(byBoat.delta.perRace.find((p) => p.raceId === 'r4').points).toBe(5);   // fleet-of-4

    // Missed race
    expect(byBoat.delta.races_sailed).toBe(4);
    expect(byBoat.delta.perRace.find((p) => p.raceId === 'r3')).toBeUndefined();

    // All qualified
    expect(byBoat.alpha.qualified).toBe(true);
    expect(byBoat.delta.qualified).toBe(true);
  });
});
