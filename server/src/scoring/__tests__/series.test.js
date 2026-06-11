'use strict';

const {
  scoreSeriesStandings,
  parseThrowoutRule,
  allowedThrowouts,
} = require('../index');

const FLEET = 'F';

/** Build a race result where each [boatId, place|status] entry is in fleet F. */
function race(raceId, raceDate, lines, fleetSize) {
  const size = fleetSize ?? lines.length;
  return {
    raceId,
    raceDate,
    results: lines.map(([boatId, placeOrStatus]) => ({
      boatId,
      fleetId: FLEET,
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

  test('ties broken by the most recent race result', () => {
    const races = [
      race('r1', '2026-05-01', [['b1', 1], ['b2', 3]]),
      race('r2', '2026-05-08', [['b1', 3], ['b2', 1]]),
    ];
    // Both total 4; b2 won the most recent race (r2) so ranks higher.
    const standings = scoreSeriesStandings({ throwout_rule: null }, races);
    const byBoat = Object.fromEntries(standings.map((s) => [s.boatId, s]));
    expect(byBoat.b1.total_points).toBe(4);
    expect(byBoat.b2.total_points).toBe(4);
    expect(byBoat.b2.rank).toBe(1);
    expect(byBoat.b1.rank).toBe(2);
  });
});
