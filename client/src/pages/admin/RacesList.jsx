import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';
import { RaceStatusBadge } from '../../components/Badges.jsx';

export default function RacesList() {
  const apiC = useApi();
  const state = useAsync(() => apiC.listRaces(), []);

  const deleteRace = async (race) => {
    if (!window.confirm(`Delete "${race.name}"? This cannot be undone.`)) return;
    try {
      await apiC.deleteRace(race.race_id);
      state.reload();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Races</h1>
        <Link to="/admin/races/new" className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
          New Race
        </Link>
      </div>
      <AsyncBoundary state={state}>
        {(races) => (
          <table className="w-full border-collapse rounded border bg-white text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Start</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {races.map((r) => (
                <tr key={r.race_id} className="border-b">
                  <td className="px-2 py-1">{String(r.race_date).slice(0, 10)}</td>
                  <td className="px-2 py-1 font-medium">
                    <Link
                      to={['published', 'revised'].includes(r.status) ? `/admin/races/${r.race_id}/results` : `/admin/races/${r.race_id}/edit`}
                      className="text-brand-700 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1">{r.start_type}</td>
                  <td className="px-2 py-1"><RaceStatusBadge status={r.status} /></td>
                  <td className="px-2 py-1 space-x-2">
                    <Link to={`/admin/races/${r.race_id}/edit`} className="text-brand-600 hover:underline">Setup</Link>
                    <Link to={`/admin/races/${r.race_id}/entries`} className="text-brand-600 hover:underline">Entries</Link>
                    <Link to={`/admin/races/${r.race_id}/results`} className="text-brand-600 hover:underline">Results</Link>
                    {r.start_type === 'pursuit' && (
                      <Link to={`/admin/races/${r.race_id}/startsheet`} className="text-brand-600 hover:underline">
                        Start Sheet
                      </Link>
                    )}
                    <button
                      onClick={() => deleteRace(r)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncBoundary>
    </AdminLayout>
  );
}
