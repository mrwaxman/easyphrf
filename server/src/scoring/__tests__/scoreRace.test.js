'use strict';

const { scoreRace } = require('../index');

const START = new Date('2026-06-01T18:00:00Z');
const finishAfter = (seconds) => new Date(START.getTime() + seconds * 1000);

function phrfRace() {
  return { start_type: 'simultaneous', start_time: START };
}

/** Build an entry + matching boat from a compact spec. */
function makeEntry(id, { fleet = 'F', type = 'phrf', phrf, elapsed, status = 'finished', override = null, spin = false, source = 'official' } = {}) {
  return {
    entry: {
      entry_id: id,
      boat_id: `boat-${id}`,
      fleet_id: fleet,
      fleet_type: type,
      finish_status: status,
      finish_time: status === 'finished' && elapsed != null ? finishAfter(elapsed) : null,
      phrf_override: override,
      using_spinnaker: spin,
    },
    boat: {
      boat_id: `boat-${id}`,
      phrf_base: phrf,
      phrf_spinnaker: phrf - 15,
      rating_source: source,
    },
  };
}

function runRace(specs, race = phrfRace()) {
  const built = specs.map(([id, opts]) => makeEntry(id, opts));
  const result = scoreRace(race, built.map((b) => b.entry), built.map((b) => b.boat));
  const byId = Object.fromEntries(result.map((e) => [e.entry_id, e]));
  return { result, byId };
}

describe('scoreRace — simultaneous start', () => {
  test('5-boat race, all finish: corrected times and places correct', () => {
    const { byId } = runRace([
      ['A', { phrf: 60, elapsed: 3600 }],
      ['B', { phrf: 90, elapsed: 3650 }],
      ['C', { phrf: 120, elapsed: 3700 }],
      ['D', { phrf: 150, elapsed: 3750 }],
      ['E', { phrf: 180, elapsed: 3800 }],
    ]);

    expect(byId.A.corrected_seconds).toBe(3296);
    expect(byId.B.corrected_seconds).toBe(3206);
    expect(byId.C.corrected_seconds).toBe(3123);
    expect(byId.D.corrected_seconds).toBe(3047);
    expect(byId.E.corrected_seconds).toBe(2976);

    // Lowest corrected wins.
    expect(byId.E.fleet_place).toBe(1);
    expect(byId.D.fleet_place).toBe(2);
    expect(byId.C.fleet_place).toBe(3);
    expect(byId.B.fleet_place).toBe(4);
    expect(byId.A.fleet_place).toBe(5);

    // Single PHRF fleet => overall mirrors fleet places.
    expect(byId.E.overall_place).toBe(1);
    expect(byId.A.overall_place).toBe(5);
    expect(byId.A.elapsed_seconds).toBe(3600);
  });

  test('tie: two boats with equal corrected time share a place', () => {
    // X: phrf 100, elapsed 7500 => 6500. Y: phrf 200, elapsed 8500 => 6500.
    const { byId } = runRace([
      ['X', { phrf: 100, elapsed: 7500 }],
      ['Y', { phrf: 200, elapsed: 8500 }],
      ['Z', { phrf: 100, elapsed: 8000 }], // 6933 -> 3rd
    ]);

    expect(byId.X.corrected_seconds).toBe(6500);
    expect(byId.Y.corrected_seconds).toBe(6500);
    expect(byId.X.fleet_place).toBe(1);
    expect(byId.Y.fleet_place).toBe(1);
    expect(byId.Z.fleet_place).toBe(3);
  });

  test('mixed A/B PHRF fleets: fleet_place per fleet, overall combined', () => {
    const { byId } = runRace([
      ['a1', { fleet: 'A', phrf: 90, elapsed: 3600 }], // 3163
      ['a2', { fleet: 'A', phrf: 90, elapsed: 3800 }], // 3339
      ['b1', { fleet: 'B', phrf: 150, elapsed: 3700 }], // 3006
      ['b2', { fleet: 'B', phrf: 150, elapsed: 3900 }], // 3169
    ]);

    // corrected: b1 3006 < a1 3163 < b2 3169 < a2 3339
    expect(byId.a1.fleet_place).toBe(1);
    expect(byId.a2.fleet_place).toBe(2);
    expect(byId.b1.fleet_place).toBe(1);
    expect(byId.b2.fleet_place).toBe(2);

    expect(byId.b1.overall_place).toBe(1);
    expect(byId.a1.overall_place).toBe(2);
    expect(byId.b2.overall_place).toBe(3);
    expect(byId.a2.overall_place).toBe(4);
  });

  test('DNF boat is placed after all finishers', () => {
    const { byId } = runRace([
      ['A', { phrf: 90, elapsed: 3600 }],
      ['B', { phrf: 90, elapsed: 3700 }],
      ['C', { phrf: 90, elapsed: 3800 }],
      ['D', { phrf: 90, status: 'dnf' }],
    ]);

    expect(byId.A.fleet_place).toBe(1);
    expect(byId.B.fleet_place).toBe(2);
    expect(byId.C.fleet_place).toBe(3);
    expect(byId.D.fleet_place).toBe(4);
    expect(byId.D.corrected_seconds).toBeNull();
    expect(byId.D.overall_place).toBe(4);
  });

  test('all DNF: no corrected times, statuses preserved', () => {
    const { result } = runRace([
      ['A', { phrf: 90, status: 'dnf' }],
      ['B', { phrf: 90, status: 'dns' }],
      ['C', { phrf: 90, status: 'dsq' }],
    ]);

    for (const e of result) {
      expect(e.corrected_seconds).toBeNull();
      expect(e.elapsed_seconds).toBeNull();
    }
    expect(result.map((e) => e.finish_status).sort()).toEqual(['dnf', 'dns', 'dsq']);
  });

  test('one-design fleet: scored on elapsed, no corrected time, excluded from overall', () => {
    const { byId } = runRace([
      ['p1', { fleet: 'P', type: 'phrf', phrf: 90, elapsed: 3600 }],
      ['o1', { fleet: 'OD', type: 'one_design', phrf: 0, elapsed: 3700 }],
      ['o2', { fleet: 'OD', type: 'one_design', phrf: 0, elapsed: 3500 }],
      ['o3', { fleet: 'OD', type: 'one_design', phrf: 0, elapsed: 3900 }],
    ]);

    // Ordered by elapsed: o2 (3500) < o1 (3700) < o3 (3900)
    expect(byId.o2.fleet_place).toBe(1);
    expect(byId.o1.fleet_place).toBe(2);
    expect(byId.o3.fleet_place).toBe(3);

    expect(byId.o1.corrected_seconds).toBeNull();
    expect(byId.o1.overall_place).toBeNull();
    expect(byId.o2.overall_place).toBeNull();

    // PHRF boat still ranks in overall.
    expect(byId.p1.overall_place).toBe(1);
  });

  test('PHRF override changes the corrected-time calculation', () => {
    const withoutOverride = runRace([['A', { phrf: 90, elapsed: 3600 }]]).byId.A;
    const withOverride = runRace([['A', { phrf: 90, elapsed: 3600, override: 150 }]]).byId.A;

    expect(withoutOverride.corrected_seconds).toBe(Math.round((3600 * 650) / 740));
    expect(withOverride.corrected_seconds).toBe(Math.round((3600 * 650) / 800));
    expect(withOverride.rating_used).toBe(150);
    expect(withOverride.override_applied).toBe(true);
    expect(withoutOverride.override_applied).toBe(false);
  });

  test('inferred ratings are flagged in the output', () => {
    const { byId } = runRace([
      ['A', { phrf: 90, elapsed: 3600, source: 'inferred' }],
      ['B', { phrf: 90, elapsed: 3700, source: 'official' }],
    ]);
    expect(byId.A.inferred).toBe(true);
    expect(byId.B.inferred).toBe(false);
  });
});

describe('scoreRace — other start types', () => {
  test('self_timed/fully_independent uses self_start_time -> finish_time', () => {
    const selfStart = new Date('2026-06-01T19:00:00Z');
    const race = { start_type: 'self_timed', self_timed_mode: 'fully_independent' };
    const entry = {
      entry_id: 'A',
      boat_id: 'boat-A',
      fleet_id: 'F',
      fleet_type: 'phrf',
      finish_status: 'finished',
      self_start_time: selfStart,
      finish_time: new Date(selfStart.getTime() + 3600 * 1000),
      using_spinnaker: false,
      phrf_override: null,
    };
    const boat = { boat_id: 'boat-A', phrf_base: 100, phrf_spinnaker: 85, rating_source: 'official' };
    const [scored] = scoreRace(race, [entry], [boat]);
    expect(scored.elapsed_seconds).toBe(3600);
    expect(scored.corrected_seconds).toBe(Math.round((3600 * 650) / 750));
  });

  test('pursuit uses each boat start_time -> finish_time', () => {
    const race = { start_type: 'pursuit' };
    const boatStart = new Date('2026-06-01T18:10:00Z');
    const entry = {
      entry_id: 'A',
      boat_id: 'boat-A',
      fleet_id: 'F',
      fleet_type: 'phrf',
      finish_status: 'finished',
      start_time: boatStart,
      finish_time: new Date(boatStart.getTime() + 5000 * 1000),
      using_spinnaker: false,
      phrf_override: null,
    };
    const boat = { boat_id: 'boat-A', phrf_base: 120, phrf_spinnaker: 105, rating_source: 'official' };
    const [scored] = scoreRace(race, [entry], [boat]);
    expect(scored.elapsed_seconds).toBe(5000);
  });
});
