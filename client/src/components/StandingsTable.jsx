/**
 * Series standings: rank, boat, skipper, total, and one column per race.
 * Throwout (discarded) scores are struck through.
 */
export function StandingsTable({ races = [], standings = [] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="px-2 py-1">Rank</th>
          <th className="px-2 py-1">Boat</th>
          <th className="px-2 py-1">Skipper</th>
          <th className="px-2 py-1">Total</th>
          {races.map((r, i) => (
            <th key={r.race_id} className="px-2 py-1" title={r.name}>
              R{i + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {standings.map((s) => {
          const perRace = new Map((s.perRace || []).map((p) => [p.raceId, p]));
          return (
            <tr key={s.boatId} className="border-b last:border-0" data-testid="standing-row">
              <td className="px-2 py-1">{s.rank}</td>
              <td className="px-2 py-1 font-medium">{s.boat ? s.boat.boat_name : s.boatId}</td>
              <td className="px-2 py-1">{s.boat ? s.boat.skipper_name : ''}</td>
              <td className="px-2 py-1 font-semibold">{s.total_points}</td>
              {races.map((r) => {
                const p = perRace.get(r.race_id);
                if (!p) return <td key={r.race_id} className="px-2 py-1 text-slate-400">—</td>;
                return (
                  <td
                    key={r.race_id}
                    className={`px-2 py-1 ${p.dropped ? 'text-slate-400 line-through' : ''}`}
                    title={p.dropped ? 'Throwout (discarded)' : undefined}
                  >
                    {p.points}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
