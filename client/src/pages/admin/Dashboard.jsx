import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';
import { RaceStatusBadge } from '../../components/Badges.jsx';

function Stat({ label, value }) {
  return (
    <div className="rounded border bg-white p-4">
      <p className="text-3xl font-bold text-brand-700">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export default function Dashboard() {
  const apiC = useApi();
  const boats = useAsync(() => apiC.listBoats(), []);
  const races = useAsync(() => apiC.listRaces(), []);
  const series = useAsync(() => apiC.listSeries(), []);

  const today = new Date().toISOString().slice(0, 10);
  const activeBoats = (boats.data || []).filter((b) => b.active).length;
  const upcoming = (races.data || []).filter(
    (r) => String(r.race_date).slice(0, 10) >= today && ['draft', 'open'].includes(r.status)
  ).length;
  const activeSeries = (series.data || []).filter((s) => s.active).length;
  const recent = (races.data || [])
    .filter((r) => ['published', 'revised'].includes(r.status))
    .slice(0, 5);

  return (
    <AdminLayout>
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Active boats" value={activeBoats} />
        <Stat label="Upcoming races" value={upcoming} />
        <Stat label="Active series" value={activeSeries} />
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
