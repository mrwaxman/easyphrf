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
  const boat = { phrf_base: 120, spinnaker_offset: 15, phrf_spinnaker: 135 };

  test('returns the override when one is set', () => {
    expect(effectiveRating({ phrf_override: 99, no_spinnaker: false }, boat)).toBe(99);
    expect(effectiveRating({ phrf_override: 0, no_spinnaker: true }, boat)).toBe(0);
  });

  test('returns phrf_base (spinnaker rating) when no_spinnaker is false (default)', () => {
    expect(effectiveRating({ phrf_override: null, no_spinnaker: false }, boat)).toBe(120);
  });

  test('returns phrf_spinnaker (NS rating) when no_spinnaker is true', () => {
    expect(effectiveRating({ phrf_override: null, no_spinnaker: true }, boat)).toBe(135);
  });

  // Per-boat rating examples from the spec.
  test('Scooter: base 72 with spinnaker, 89 non-spin', () => {
    const scooter = { phrf_base: 72, phrf_spinnaker: 89 };
    expect(effectiveRating({ phrf_override: null, no_spinnaker: false }, scooter)).toBe(72);
    expect(effectiveRating({ phrf_override: null, no_spinnaker: true }, scooter)).toBe(89);
  });

  test('Jaybird: base 129 with spinnaker, 134 non-spin', () => {
    const jaybird = { phrf_base: 129, phrf_spinnaker: 134 };
    expect(effectiveRating({ phrf_override: null, no_spinnaker: false }, jaybird)).toBe(129);
    expect(effectiveRating({ phrf_override: null, no_spinnaker: true }, jaybird)).toBe(134);
  });

  test('Bratmobile: base 150 with spinnaker, 170 non-spin', () => {
    const bratmobile = { phrf_base: 150, phrf_spinnaker: 170 };
    expect(effectiveRating({ phrf_override: null, no_spinnaker: false }, bratmobile)).toBe(150);
    expect(effectiveRating({ phrf_override: null, no_spinnaker: true }, bratmobile)).toBe(170);
  });

  test('phrf_override wins over both spinnaker and non-spin elections', () => {
    const boat2 = { phrf_base: 100, phrf_spinnaker: 115 };
    expect(effectiveRating({ phrf_override: 88, no_spinnaker: false }, boat2)).toBe(88);
    expect(effectiveRating({ phrf_override: 88, no_spinnaker: true }, boat2)).toBe(88);
  });
});
