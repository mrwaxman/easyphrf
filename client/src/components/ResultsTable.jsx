import { formatDuration } from '@easyphrf/shared';
import { InferredBadge, OverrideBadge, FinishStatusLabel } from './Badges.jsx';

const isFinisher = (e) => e.finish_status === 'finished';

/**
 * Order entries for display: finishers first (by fleet place), then
 * non-finishers (DNF/DNS/DSQ/RAF) after, preserving their relative order.
 */
function orderedEntries(entries) {
  const finishers = entries
    .filter(isFinisher)
    .slice()
    .sort((a, b) => (a.fleet_place ?? 1e9) - (b.fleet_place ?? 1e9));
  const others = entries.filter((e) => !isFinisher(e));
  return [...finishers, ...others];
}

/**
 * Results table for a single fleet. One-design fleets are scored on elapsed
 * time only (no PHRF / corrected columns of meaning).
 */
export function ResultsTable({ fleet }) {
  const oneDesign = fleet.fleet_type === 'one_design';
  const rows = orderedEntries(fleet.entries || []);

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="px-2 py-1">Place</th>
          <th className="px-2 py-1">Boat Name</th>
          <th className="px-2 py-1">Sail #</th>
          <th className="px-2 py-1">Skipper</th>
          <th className="px-2 py-1">PHRF</th>
          <th className="px-2 py-1">Elapsed</th>
          <th className="px-2 py-1">Corrected</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const finished = isFinisher(e);
          const inferred = e.inferred || e.rating_source === 'inferred';
          const override = e.override_applied || (e.phrf_override !== null && e.phrf_override !== undefined);
          return (
            <tr key={e.entry_id} className="border-b last:border-0" data-testid="results-row" data-boat={e.boat_name}>
              <td className="px-2 py-1">{finished ? e.fleet_place : '—'}</td>
              <td className="px-2 py-1 font-medium">{e.boat_name}</td>
              <td className="px-2 py-1">{e.sail_number}</td>
              <td className="px-2 py-1">{e.skipper_name}</td>
              <td className="px-2 py-1">
                {oneDesign ? (
                  '—'
                ) : (
                  <>
                    {e.rating_used}
                    {inferred && <InferredBadge />}
                    {override && <OverrideBadge note={e.phrf_override_note} />}
                  </>
                )}
              </td>
              <td className="px-2 py-1">
                {finished ? formatDuration(e.elapsed_seconds) : <FinishStatusLabel status={e.finish_status} />}
              </td>
              <td className="px-2 py-1">{finished && !oneDesign ? formatDuration(e.corrected_seconds) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
