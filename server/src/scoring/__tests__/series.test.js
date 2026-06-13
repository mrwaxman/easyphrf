'use strict';

const {
  scoreSeriesStandings,
  parseThrowoutRule,
  allowedThrowouts,
} = require('../index');

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

describe('parseThrowoutRule', () => {
  test('parses single and multi-threshold rules', () => {
    expect(parseThrowoutRule('1 throwout after 4 races')).toEqual([{ throwouts: 1, after: 4 }]);
    expect(parseThrowoutRule('1 throwout after 4 races, 2 after 8 races')).toEqual([
      { throwouts: 1, after: 4 },
      { throwouts: 2, after: 8 },
    ]);
  });

  test('returns [] for empty/garbage', () => {
    expect(parseThrowoutRule(null)).toEqual([]);
    expect(parseThrowoutRule('')).toEqual([]);
    expect(parseThrowoutRule('no rule here')).toEqual([]);
  });
});

describe('allowedThrowouts', () => {
  const rules = parseThrowoutRule('1 throwout after 4 races, 2 after 8 races');
  test('applies the highest reached threshold', () => {
    expect(allowedThrowouts(rules, 3)).toBe(0);
    expect(allowedThrowouts(rules, 4)).toBe(1);
    expect(allowedThrowouts(rules, 7)).toBe(1);
    expect(allowedThrowouts(rules, 8)).toBe(2);
    expect(allowedThrowouts(rules, 12)).toBe(2);
  });
});

describe('scoreSeriesStandings', () => {
  test('3-race series, 4 boats, no throwouts: totals and ranks', () => {
    const races = [
      race('r1', '2026-05-01', [['b1', 1], ['b2', 2], ['b3', 3], ['b4', 4]]),
      race('r2', '2026-05-08', [['b1', 2], ['b2', 1], ['b3', 4], ['b4', 3]]),
      race('r3', '2026-05-15', [['b1', 1], ['b2', 3], ['b3', 2], ['b4', 4]]),
    ];
    const standings = scoreSeriesStandings({ throwout_rule: null }, races);
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

  test('"1 throwout after 4 races": worst race is dropped', () => {
    const races = [
      race('r1', '2026-05-01', [['b1', 1]], 5),
      race('r2', '2026-05-08', [['b1', 1]], 5),
      race('r3', '2026-05-15', [['b1', 4]], 5),
      race('r4', '2026-05-22', [['b1', 1]], 5),
    ];
    const [s] = scoreSeriesStandings({ throwout_rule: '1 throwout after 4 races' }, races);

    expect(s.races_sailed).toBe(4);
    expect(s.total_points).toBe(3); // 1 + 1 + 1, the 4 dropped
    expect(s.throwouts).toHaveLength(1);
    expect(s.throwouts[0]).toMatchObject({ raceId: 'r3', points: 4 });
    expect(s.perRace.find((p) => p.raceId === 'r3').dropped).toBe(true);
  });

  test('"1 after 4, 2 after 8": both thresholds honored', () => {
    const eight = [
      race('r1', '2026-05-01', [['b1', 1]], 6),
      race('r2', '2026-05-02', [['b1', 1]], 6),
      race('r3', '2026-05-03', [['b1', 1]], 6),
      race('r4', '2026-05-04', [['b1', 1]], 6),
      race('r5', '2026-05-05', [['b1', 1]], 6),
      race('r6', '2026-05-06', [['b1', 1]], 6),
      race('r7', '2026-05-07', [['b1', 5]], 6),
      race('r8', '2026-05-08', [['b1', 4]], 6),
    ];
    const [s8] = scoreSeriesStandings(
      { throwout_rule: '1 throwout after 4 races, 2 after 8 races' },
      eight
    );
    expect(s8.races_sailed).toBe(8);
    expect(s8.total_points).toBe(6); // six 1s kept; 5 and 4 dropped
    expect(s8.throwouts.map((t) => t.points).sort((a, b) => a - b)).toEqual([4, 5]);

    // With only 4 races the same rule drops just one.
    const [s4] = scoreSeriesStandings(
      { throwout_rule: '1 throwout after 4 races, 2 after 8 races' },
      eight.slice(0, 4)
    );
    expect(s4.throwouts).toHaveLength(1);
  });

  test('DNF scores fleetSize + 1 points', () => {
    const races = [race('r1', '2026-05-01', [['b1', 'dnf']], 6)];
    const [s] = scoreSeriesStandings({ throwout_rule: null }, races);
    expect(s.total_points).toBe(7); // 6 entries + 1
  });

  test('A8.1 then A8.2: equal totals resolved by count-of-places, then most-recent race', () => {
    // A8.2 case: b1=[1,3] sorted [1,3], b2=[3,1] sorted [1,3] — A8.1 equal.
    // A8.2: R2 b1=3, b2=1 — b2 wins.
    const races = [
      race('r1', '2026-05-01', [['b1', 1], ['b2', 3]]),
      race('r2', '2026-05-08', [['b1', 3], ['b2', 1]]),
    ];
    const standings = scoreSeriesStandings({ throwout_rule: null }, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));
    expect(byBoat.b1.total_points).toBe(4);
    expect(byBoat.b2.total_points).toBe(4);
    // A8.1 equal (both have one 1st and one 3rd); A8.2: b2 won R2 (most recent)
    expect(byBoat.b2.rank).toBe(1);
    expect(byBoat.b1.rank).toBe(2);
  });

  test('A8.1 breaks tie without needing A8.2', () => {
    // b1 has two 1sts and one 3rd; b2 has one 1st and two 2nds — same total but different place distribution
    // b1 total = 1+1+3 = 5; b2 total = 1+2+2 = 5
    // A8.1: b1 sorted kept [1,1,3]; b2 sorted kept [1,2,2]
    // Compare position 1: b1=1 < b2=2 → b1 wins A8.1
    const races = [
      race('r1', '2026-05-01', [['b1', 1], ['b2', 1]]),
      race('r2', '2026-05-08', [['b1', 1], ['b2', 2]]),
      race('r3', '2026-05-15', [['b1', 3], ['b2', 2]]),
    ];
    const standings = scoreSeriesStandings({ throwout_rule: null }, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));
    expect(byBoat.b1.total_points).toBe(5);
    expect(byBoat.b2.total_points).toBe(5);
    expect(byBoat.b1.rank).toBe(1); // b1 wins A8.1 (more 1sts)
    expect(byBoat.b2.rank).toBe(2);
  });

  test('minimum races: boats below threshold are unqualified with rank null', () => {
    // 3 races, min_races_to_qualify = 3
    // Boat P sails all 3 → qualified
    // Boat Q sails only 2 → not qualified
    const races = [
      race('r1', '2026-05-01', [['P', 1], ['Q', 2]]),
      race('r2', '2026-05-08', [['P', 1], ['Q', 2]]),
      race('r3', '2026-05-15', [['P', 1]]),            // Q missed this one
    ];
    const standings = scoreSeriesStandings({ throwout_rule: null, min_races_to_qualify: 3 }, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));

    expect(byBoat.P.qualified).toBe(true);
    expect(byBoat.P.rank).toBe(1);

    expect(byBoat.Q.qualified).toBe(false);
    expect(byBoat.Q.rank).toBeNull();
  });

  test('per-fleet: boats in different fleets are tracked separately', () => {
    // Fleet FA and fleet FB race simultaneously. Points should be fleet-scoped.
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

    // Each boat scores its fleet-relative place (not cross-fleet)
    expect(byBoat.a1.total_points).toBe(1);
    expect(byBoat.a2.total_points).toBe(2);
    expect(byBoat.b1.total_points).toBe(1);
    expect(byBoat.b2.total_points).toBe(2);

    // Fleet IDs preserved
    expect(byBoat.a1.fleetId).toBe('FA');
    expect(byBoat.b1.fleetId).toBe('FB');
  });

  // ─── Comprehensive worked example ────────────────────────────────────────────
  //
  // Series: "Summer 2026"
  //   throwout_rule: "1 throwout after 4 races"
  //   min_races_to_qualify: 3
  //
  // Boats: alpha, bravo, charlie, delta
  //
  // Race data (all in fleet 'F', fleet sizes noted):
  //
  //   R1 2026-05-01 (4 entries): alpha=1, bravo=2, charlie=3, delta=4
  //   R2 2026-05-08 (4 entries): bravo=1, alpha=2, charlie=3, delta=4
  //   R3 2026-05-15 (3 entries): alpha=1, bravo=2, charlie=DNF  [delta missed]
  //   R4 2026-05-22 (4 entries): bravo=1, alpha=2, charlie=3,   delta=DNF
  //   R5 2026-05-29 (4 entries): alpha=1, bravo=2, charlie=3,   delta=4
  //
  // Hand-computed per-boat:
  //
  //  alpha: scores [1,2,1,2,1], sailed=5, throwouts=1
  //         worst=2 (R2 and R4 tie; drop later = R4)
  //         kept: R1=1, R2=2, R3=1, R5=1 → total=5
  //
  //  bravo: scores [2,1,2,1,2], sailed=5, throwouts=1
  //         worst=2 (R1,R3,R5; drop latest = R5)
  //         kept: R1=2, R2=1, R3=2, R4=1 → total=6
  //
  //  charlie: scores [3,3,4,3,3], sailed=5, throwouts=1
  //           worst=4 (R3: DNF in fleet-of-3 → 3+1=4)
  //           kept: R1=3, R2=3, R4=3, R5=3 → total=12
  //
  //  delta: scores [4,4,—,5,4], sailed=4, throwouts=1
  //         (R3 missed = nothing; R4 DNF in fleet-of-4 → 4+1=5)
  //         worst=5 (R4); kept: R1=4, R2=4, R5=4 → total=12
  //
  // Tie (charlie 12 vs delta 12):
  //   A8.1: charlie kept sorted [3,3,3,3]; delta kept sorted [4,4,4]
  //         position 0: charlie=3 < delta=4 → charlie wins A8.1
  //
  // Final ranking: alpha=1, bravo=2, charlie=3, delta=4
  // ────────────────────────────────────────────────────────────────────────────

  test('worked 5-race example: totals, throwouts, DNF, A8.1 tiebreak, missed race', () => {
    const SERIES = { throwout_rule: '1 throwout after 4 races', min_races_to_qualify: 3 };

    const races = [
      race('r1', '2026-05-01', [['alpha', 1], ['bravo', 2], ['charlie', 3], ['delta', 4]]),
      race('r2', '2026-05-08', [['bravo', 1], ['alpha', 2], ['charlie', 3], ['delta', 4]]),
      // R3: 3-entry fleet (delta absent); charlie DNF → 3+1=4 pts
      race('r3', '2026-05-15', [['alpha', 1], ['bravo', 2], ['charlie', 'dnf']], 3),
      // R4: 4-entry fleet; delta DNF → 4+1=5 pts
      race('r4', '2026-05-22', [['bravo', 1], ['alpha', 2], ['charlie', 3], ['delta', 'dnf']], 4),
      race('r5', '2026-05-29', [['alpha', 1], ['bravo', 2], ['charlie', 3], ['delta', 4]]),
    ];

    const standings = scoreSeriesStandings(SERIES, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));

    // Print expected-vs-actual for auditability
    const EXPECTED = {
      alpha:   { total: 5,  rank: 1, throwoutRace: 'r4', throwoutPts: 2  },
      bravo:   { total: 6,  rank: 2, throwoutRace: 'r5', throwoutPts: 2  },
      charlie: { total: 12, rank: 3, throwoutRace: 'r3', throwoutPts: 4  },
      delta:   { total: 12, rank: 4, throwoutRace: 'r4', throwoutPts: 5  },
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

    // — Totals —
    expect(byBoat.alpha.total_points).toBe(5);
    expect(byBoat.bravo.total_points).toBe(6);
    expect(byBoat.charlie.total_points).toBe(12);
    expect(byBoat.delta.total_points).toBe(12);

    // — Ranks —
    expect(byBoat.alpha.rank).toBe(1);
    expect(byBoat.bravo.rank).toBe(2);
    expect(byBoat.charlie.rank).toBe(3); // A8.1 beats delta
    expect(byBoat.delta.rank).toBe(4);

    // — Throwouts —
    expect(byBoat.alpha.throwouts).toHaveLength(1);
    expect(byBoat.alpha.throwouts[0]).toMatchObject({ raceId: 'r4', points: 2 });
    expect(byBoat.bravo.throwouts[0]).toMatchObject({ raceId: 'r5', points: 2 });
    expect(byBoat.charlie.throwouts[0]).toMatchObject({ raceId: 'r3', points: 4 });
    expect(byBoat.delta.throwouts[0]).toMatchObject({ raceId: 'r4', points: 5 });

    // — DNF penalty: fleet-size + 1 —
    // charlie R3: fleet-of-3 → DNF = 4 pts
    expect(byBoat.charlie.perRace.find((p) => p.raceId === 'r3').points).toBe(4);
    // delta R4: fleet-of-4 → DNF = 5 pts
    expect(byBoat.delta.perRace.find((p) => p.raceId === 'r4').points).toBe(5);

    // — Missed race: delta didn't enter R3 at all —
    expect(byBoat.delta.races_sailed).toBe(4);
    expect(byBoat.delta.perRace.find((p) => p.raceId === 'r3')).toBeUndefined();

    // — All boats sailed ≥ 3 races → all qualified —
    expect(byBoat.alpha.qualified).toBe(true);
    expect(byBoat.delta.qualified).toBe(true);

    // — perRace dropped flags —
    expect(byBoat.alpha.perRace.find((p) => p.raceId === 'r4').dropped).toBe(true);
    expect(byBoat.bravo.perRace.find((p) => p.raceId === 'r5').dropped).toBe(true);
  });
});
