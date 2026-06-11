import { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';
import { StandingsTable } from '../../components/StandingsTable.jsx';

const BLANK = { name: '', season_year: new Date().getFullYear(), throwout_rule: '', notes: '' };

export default function Series() {
  const apiC = useApi();
  const state = useAsync(() => apiC.listSeries(), []);
  const [form, setForm] = useState(BLANK);
  const [standings, setStandings] = useState(null);
  const [error, setError] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await apiC.createSeries({ ...form, season_year: Number(form.season_year) });
      setForm(BLANK);
      state.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const recalc = async (sid) => {
    const data = await apiC.recalculateSeries(sid);
    setStandings(data);
  };

  return (
    <AdminLayout>
      <h1 className="mb-4 text-2xl font-bold">Series</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={create} className="mb-6 grid grid-cols-2 gap-3 rounded border bg-white p-4 md:grid-cols-4">
        <input placeholder="Name" className="rounded border px-2 py-1 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Season year" className="rounded border px-2 py-1 text-sm" value={form.season_year} onChange={(e) => setForm({ ...form, season_year: e.target.value })} />
        <input placeholder="Throwout rule e.g. 1 throwout after 4 races" className="rounded border px-2 py-1 text-sm md:col-span-2" value={form.throwout_rule} onChange={(e) => setForm({ ...form, throwout_rule: e.target.value })} />
        <button type="submit" className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white">Create Series</button>
      </form>

      <AsyncBoundary state={state}>
        {(series) => (
          <ul className="divide-y rounded border bg-white">
            {series.map((s) => (
              <li key={s.series_id} className="flex items-center justify-between p-3">
                <span>
                  <strong>{s.name}</strong> <span className="text-slate-400">· {s.season_year}</span>
                  {s.throwout_rule && <span className="ml-2 text-xs text-slate-500">({s.throwout_rule})</span>}
                </span>
                <button onClick={() => recalc(s.series_id)} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">
                  Recalculate standings
                </button>
              </li>
            ))}
            {series.length === 0 && <li className="p-3 text-slate-500">No series yet.</li>}
          </ul>
        )}
      </AsyncBoundary>

      {standings && (
        <section className="mt-6 rounded border bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">{standings.series.name} — Standings</h2>
          {standings.standings.length === 0 ? (
            <p className="text-slate-500">No scored races yet.</p>
          ) : (
            <StandingsTable races={standings.races} standings={standings.standings} />
          )}
        </section>
      )}
    </AdminLayout>
  );
}
