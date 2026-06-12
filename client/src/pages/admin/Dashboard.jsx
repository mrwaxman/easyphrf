import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';
import { RaceStatusBadge } from '../../components/Badges.jsx';

export default function Dashboard() {
  const apiC = useApi();
  const boats = useAsync(() => apiC.listBoats(), []);
  const races = useAsync(() => apiC.listRaces(), []);
  const series = useAsync(() => apiC.listSeries(), []);

  const today = new Date().toISOString().slice(0, 10);
  const activeBoats = (boats.data || []).filter((b) => b.active).length;
  const upcomingRaces = (races.data || []).filter(
    (r) => String(r.race_date).slice(0, 10) >= today && ['draft', 'open'].includes(r.status)
  );
  const activeSeriesList = (series.data || []).filter((s) => s.active);
  const recent = (races.data || [])
    .filter((r) => ['published', 'revised'].includes(r.status))
    .slice(0, 5);

  return (
    <AdminLayout>
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Link
          to="/admin/boats"
          className="block rounded border bg-white p-4 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <p className="text-3xl font-bold text-brand-700">{activeBoats}</p>
          <p className="text-sm text-slate-500">Active boats</p>
        </Link>
        <div className="rounded border bg-white p-4">
          <p className="text-3xl font-bold text-brand-700">{upcomingRaces.length}</p>
          <p className="text-sm text-slate-500">Upcoming races</p>
          <ul className="mt-2 space-y-1">
            {upcomingRaces.map((r) => (
              <Link
                key={r.race_id}
                to={`/admin/races/${r.race_id}/entries`}
                className="block truncate text-xs text-brand-700 hover:underline focus:underline focus:outline-none"
              >
                {r.name}
              </Link>
            ))}
          </ul>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-3xl font-bold text-brand-700">{activeSeriesList.length}</p>
          <p className="text-sm text-slate-500">Active series</p>
          <ul className="mt-2 space-y-1">
            {activeSeriesList.map((s) => (
              <Link
                key={s.series_id}
                to={`/series/${s.series_id}`}
                className="block truncate text-xs text-brand-700 hover:underline focus:underline focus:outline-none"
              >
                {s.name}
              </Link>
            ))}
          </ul>
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <Link to="/admin/races/new" className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
          New Race
        </Link>
        <Link to="/admin/boats" className="rounded border px-3 py-2 text-sm font-medium hover:bg-slate-50">
          Add Boat
        </Link>
        <Link to="/admin/series" className="rounded border px-3 py-2 text-sm font-medium hover:bg-slate-50">
          New Series
        </Link>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Recent published races</h2>
      <ul className="divide-y rounded border bg-white">
        {recent.length === 0 && <li className="p-3 text-slate-500">Nothing published yet.</li>}
        {recent.map((r) => (
          <li key={r.race_id} className="flex items-center justify-between p-3">
            <Link to={`/admin/races/${r.race_id}/results`} className="font-medium text-brand-700 hover:underline">
              {r.name}
            </Link>
            <RaceStatusBadge status={r.status} />
          </li>
        ))}
      </ul>
    </AdminLayout>
  );
}
