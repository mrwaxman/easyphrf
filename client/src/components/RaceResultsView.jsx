import { ResultsTable } from './ResultsTable.jsx';
import { RevisionNotice } from './RevisionNotice.jsx';

/**
 * Full read-only view of a scored race: header, optional revision notice,
 * per-fleet result tables, an overall PHRF standings section when more than one
 * PHRF fleet raced, and one-design fleets shown separately.
 */
export function RaceResultsView({ race }) {
  if (!race) return null;
  const phrfFleets = (race.fleets || []).filter((f) => f.fleet_type === 'phrf');
  const oneDesignFleets = (race.fleets || []).filter((f) => f.fleet_type === 'one_design');
  const dateStr = race.race_date ? String(race.race_date).slice(0, 10) : '';

  return (
    <div>
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-brand-700">{race.name}</h1>
        <p className="text-sm text-slate-500">
          {[dateStr, race.start_type, race.race_distance ? `${race.race_distance} nm` : null]
            .filter(Boolean)
            .join('  •  ')}
        </p>
      </header>

      {race.status === 'revised' && (
        <RevisionNotice revisionNotes={race.revision_notes} revisedAt={race.revised_at} />
      )}

      {phrfFleets.map((fleet) => (
        <section key={fleet.fleet_id} className="my-5">
          <h2 className="mb-1 text-lg font-semibold">{fleet.name}</h2>
          <ResultsTable fleet={fleet} />
        </section>
      ))}

      {race.has_multiple_phrf_fleets && race.overall && race.overall.length > 0 && (
        <section className="my-5" data-testid="overall-standings">
          <h2 className="mb-1 text-lg font-semibold">Overall PHRF Standings</h2>
          <ResultsTable
            fleet={{
              fleet_id: 'overall',
              fleet_type: 'phrf',
              entries: race.overall.map((e) => ({ ...e, fleet_place: e.overall_place })),
            }}
          />
        </section>
      )}

      {oneDesignFleets.map((fleet) => (
        <section key={fleet.fleet_id} className="my-5">
          <h2 className="mb-1 text-lg font-semibold">{fleet.name} (One-Design)</h2>
          <ResultsTable fleet={fleet} />
        </section>
      ))}
    </div>
  );
}
