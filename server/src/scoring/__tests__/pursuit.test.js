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
});
