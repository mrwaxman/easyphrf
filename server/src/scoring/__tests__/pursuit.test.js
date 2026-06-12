'use strict';

const { calculatePursuitStarts } = require('../index');

const START = new Date('2026-06-01T18:00:00Z');

describe('calculatePursuitStarts', () => {
  const fleet = [
    { boatId: 'slow', phrf: 150 },
    { boatId: 'mid-slow', phrf: 120 },
    { boatId: 'mid-fast', phrf: 90 },
    { boatId: 'fast', phrf: 60 },
  ];

  test('4-boat fleet: start order and intervals (explicit factor)', () => {
    const starts = calculatePursuitStarts(fleet, 'slow', START, { factor: 10 });
    const byId = Object.fromEntries(starts.map((s) => [s.boatId, s]));

    expect(byId['slow'].intervalSeconds).toBe(0);
    expect(byId['mid-slow'].intervalSeconds).toBe(300);
    expect(byId['mid-fast'].intervalSeconds).toBe(600);
    expect(byId['fast'].intervalSeconds).toBe(900);

    // Sorted ascending by start time.
    expect(starts.map((s) => s.boatId)).toEqual(['slow', 'mid-slow', 'mid-fast', 'fast']);
  });

  test('reference boat starts at exactly race start time', () => {
    const starts = calculatePursuitStarts(fleet, 'slow', START, { factor: 10 });
    const ref = starts.find((s) => s.boatId === 'slow');
    expect(ref.intervalSeconds).toBe(0);
    expect(ref.startTime.getTime()).toBe(START.getTime());
  });

  test('fastest boat (lowest PHRF) starts last', () => {
    const starts = calculatePursuitStarts(fleet, 'slow', START);
    expect(starts[starts.length - 1].boatId).toBe('fast');
    // Intervals strictly increase with the default (positive) factor.
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i].intervalSeconds).toBeGreaterThan(starts[i - 1].intervalSeconds);
    }
  });

  test('start times equal race start + interval', () => {
    const starts = calculatePursuitStarts(fleet, 'slow', START, { factor: 10 });
    for (const s of starts) {
      expect(s.startTime.getTime()).toBe(START.getTime() + s.intervalSeconds * 1000);
    }
  });

  test('single-boat fleet: only one start time, at the start', () => {
    const starts = calculatePursuitStarts([{ boatId: 'x', phrf: 100 }], 'x', START);
    expect(starts).toHaveLength(1);
    expect(starts[0].intervalSeconds).toBe(0);
    expect(starts[0].startTime.getTime()).toBe(START.getTime());
  });

  test('throws if the reference boat is not in the fleet', () => {
    expect(() => calculatePursuitStarts(fleet, 'nope', START)).toThrow(/not found/);
  });

  test('default raceSeconds is 80 minutes (4800 s)', () => {
    // With no options, the factor is derived from DEFAULT_PURSUIT_RACE_SECONDS (4800 s).
    // Passing raceSeconds: 4800 explicitly must produce identical intervals.
    const defaultStarts = calculatePursuitStarts(fleet, 'slow', START);
    const explicitStarts = calculatePursuitStarts(fleet, 'slow', START, { raceSeconds: 4800 });
    defaultStarts.forEach((s, i) => {
      expect(s.intervalSeconds).toBe(explicitStarts[i].intervalSeconds);
    });
  });

  test('raceSeconds option scales delays proportionally (80 min is 2/3 of 120 min)', () => {
    // Concrete example from spec: fleet [slow:150, fast:71], avgPHRF=110.5.
    // At 120 min the fast boat is delayed 12:28 (748 s); at 80 min it is ~8:19 (499 s).
    const f = [{ boatId: 'slow', phrf: 150 }, { boatId: 'fast', phrf: 71 }];
    const at120 = calculatePursuitStarts(f, 'slow', START, { raceSeconds: 7200 });
    const at80  = calculatePursuitStarts(f, 'slow', START, { raceSeconds: 4800 });
    const fast120 = at120.find((s) => s.boatId === 'fast');
    const fast80  = at80.find((s)  => s.boatId === 'fast');
    expect(fast120.intervalSeconds).toBe(748);  // 12:28
    expect(fast80.intervalSeconds).toBe(499);   // 8:19
  });

  test('start times carry sub-minute precision when the default factor is non-integer', () => {
    // With the default raceSeconds (4800) and fleet avgPHRF=105, factor ≈ 6.357 (non-integer).
    // The fast boat (phrf 60, diff 90) gets interval = round(90 * 6.357) = 572 s (9 min 32 s).
    const starts = calculatePursuitStarts(fleet, 'slow', START);
    const fast = starts.find((s) => s.boatId === 'fast');
    expect(fast.intervalSeconds % 60).not.toBe(0);
    expect((fast.startTime.getTime() - START.getTime()) / 1000 % 60).not.toBe(0);
  });
});
