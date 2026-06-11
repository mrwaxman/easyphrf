import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';
import { Layout } from '../../components/Layout.jsx';
import { RaceStatusBadge } from '../../components/Badges.jsx';

export default function Home() {
  const clubState = useAsync(() => api.club(), []);
  const racesState = useAsync(() => api.races(), []);

  return (
    <Layout club={clubState.data}>
      <h1 className="mb-4 text-xl font-bold">Race Results</h1>
      <AsyncBoundary state={racesState}>
        {(races) =>
          races.length === 0 ? (
            <p className="text-slate-500">No published races yet.</p>
          ) : (
            <ul className="divide-y rounded border bg-white">
              {races.map((r) => (
                <li key={r.race_id} className="flex items-center justify-between p-3">
                  <div>
                    <Link to={`/races/${r.race_id}`} className="font-medium text-brand-700 hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {String(r.race_date).slice(0, 10)} · {r.start_type}
                      {r.fleets && r.fleets.length > 0 && ` · ${r.fleets.map((f) => f.name).join(', ')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RaceStatusBadge status={r.status} />
                    <Link to={`/races/${r.race_id}`} className="text-sm text-brand-600 hover:underline">
                      View Results →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </AsyncBoundary>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Series</h2>
      <SeriesList />
    </Layout>
  );
}

function SeriesList() {
  const state = useAsync(() => api.seriesList(), []);
  return (
    <AsyncBoundary state={state}>
      {(series) =>
        series.length === 0 ? (
          <p className="text-slate-500">No active series.</p>
        ) : (
          <ul className="divide-y rounded border bg-white">
            {series.map((s) => (
              <li key={s.series_id} className="p-3">
                <Link to={`/series/${s.series_id}`} className="font-medium text-brand-700 hover:underline">
                  {s.name} <span className="text-slate-400">· {s.season_year}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    </AsyncBoundary>
  );
}
