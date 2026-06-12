'use strict';

const { correctTimeToT, effectiveRating } = require('../index');

describe('correctTimeToT', () => {
  test('known input/output pairs', () => {
    // corrected = elapsed * 650 / (650 + phrf)
    expect(correctTimeToT(7200, 100)).toBeCloseTo((7200 * 650) / 750, 6); // 6240
    expect(correctTimeToT(7200, 200)).toBeCloseTo((7200 * 650) / 850, 6);
    expect(correctTimeToT(3600, 90)).toBeCloseTo((3600 * 650) / 740, 6);
  });

  test('PHRF = 0 returns the elapsed time unchanged', () => {
    expect(correctTimeToT(5000, 0)).toBe(5000);
  });

  test('very high PHRF (180+) is handled', () => {
    expect(correctTimeToT(7200, 180)).toBeCloseTo((7200 * 650) / 830, 6);
    expect(correctTimeToT(7200, 240)).toBeCloseTo((7200 * 650) / 890, 6);
  });

  test('for a fixed elapsed time, HIGHER PHRF yields a LOWER corrected time', () => {
    // This is the correct PHRF direction: a higher-rated (slower) boat that
    // posts the same elapsed time as a faster boat performed better and earns a
    // lower (better) corrected time. (The spec prose bullet is reversed.)
    const elapsed = 7200;
    expect(correctTimeToT(elapsed, 150)).toBeLessThan(correctTimeToT(elapsed, 50));
    expect(correctTimeToT(elapsed, 200)).toBeLessThan(correctTimeToT(elapsed, 100));
  });
});

describe('effectiveRating', () => {
  // New convention: phrf_base is the faster spinnaker rating; phrf_spinnaker
  // (= phrf_base + spinnaker_offset) is the slower non-spin rating.
  const boat = { phrf_base: 120, spinnaker_offset: 15, phrf_spinnaker: 135 };

  test('returns the override when one is set (even with a spinnaker flown)', () => {
    expect(effectiveRating({ phrf_override: 99, using_spinnaker: true }, boat)).toBe(99);
    expect(effectiveRating({ phrf_override: 0, using_spinnaker: false }, boat)).toBe(0);
  });

  test('returns phrf_base (the spinnaker rating) when flying a kite and no override', () => {
    expect(effectiveRating({ phrf_override: null, using_spinnaker: true }, boat)).toBe(120);
  });

  test('returns phrf_spinnaker (the non-spin rating) when not flying a kite and no override', () => {
    expect(effectiveRating({ phrf_override: null, using_spinnaker: false }, boat)).toBe(135);
  });
});
