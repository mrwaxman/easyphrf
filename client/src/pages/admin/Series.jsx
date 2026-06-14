import { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';
import { StandingsTable } from '../../components/StandingsTable.jsx';

const BLANK = {
  name: '',
  season_year: new Date().getFullYear(),
  throwouts_enabled: false,
  throwout_tiers: [{ after_races: '', throwouts: '' }],
  min_races_to_qualify: '',
  notes: '',
};

export default function Series() {
  const apiC = useApi();
  const state = useAsync(() => apiC.listSeries(), []);
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [allRaces, setAllRaces] = useState(null);
  const [standings, setStandings] = useState(null);
  const [error, setError] = useState(null);

  const updateTier = (i, key, val) => {
    const tiers = form.throwout_tiers.map((t, idx) => (idx === i ? { ...t, [key]: val } : t));
    setForm({ ...form, throwout_tiers: tiers });
  };

  const addTier = () =>
    setForm({ ...form, throwout_tiers: [...form.throwout_tiers, { after_races: '', throwouts: '' }] });

  const removeTier = (i) =>
    setForm({ ...form, throwout_tiers: form.throwout_tiers.filter((_, idx) => idx !== i) });

  const startEditing = (series) => {
    setEditing(series);
    setStandings(null);
    setError(null);
    const tiers = series.throwout_tiers || [];
    setForm({
      name: series.name,
      season_year: series.season_year,
      throwouts_enabled: series.throwouts_enabled ?? false,
      throwout_tiers:
        tiers.length > 0
          ? tiers.map((t) => ({ after_races: String(t.after_races), throwouts: String(t.throwouts) }))
          : [{ after_races: '', throwouts: '' }],
      min_races_to_qualify: series.min_races_to_qualify ?? '',
      notes: series.notes ?? '',
    });
    apiC.listRaces().then(setAllRaces).catch(() => setAllRaces([]));
  };

  const cancelEditing = () => {
    setEditing(null);
    setForm(BLANK);
    setAllRaces(null);
    setError(null);
  };

  const buildPayload = () => ({
    ...form,
    season_year: Number(form.season_year),
    throwout_tiers: form.throwouts_enabled
      ? form.throwout_tiers
          .filter((t) => t.after_races !== '' && t.throwouts !== '')
          .map((t) => ({ after_races: Number(t.after_races), throwouts: Number(t.throwouts) }))
      : [],
    min_races_to_qualify: form.min_races_to_qualify !== '' ? Number(form.min_races_to_qualify) : null,
  });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await apiC.updateSeries(editing.series_id, buildPayload());
        cancelEditing();
      } else {
        await apiC.createSeries(buildPayload());
        setForm(BLANK);
      }
      state.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleRaceAssignment = async (raceId, currentSeriesId) => {
    const newSeriesId = currentSeriesId === editing.series_id ? null : editing.series_id;
    try {
      await apiC.updateRace(raceId, { series_id: newSeriesId });
      const updated = await apiC.listRaces();
      setAllRaces(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  const recalc = async (sid) => {
    const data = await apiC.recalculateSeries(sid);
    setStandings(data);
  };

  const fleetSections = standings
    ? standings.fleetStandings && standings.fleetStandings.length > 0
      ? standings.fleetStandings
      : [{ fleetName: null, standings: standings.standings || [] }]
    : [];

  return (
    <AdminLayout>
      <h1 className="mb-4 text-2xl font-bold">Series</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={submit} className="mb-6 rounded border bg-white p-4">
        {editing && (
          <p className="mb-3 text-sm font-medium text-brand-700">
            Editing: <span className="font-bold">{editing.name}</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input
            placeholder="Name"
            className="rounded border px-2 py-1 text-sm"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Season year"
            className="rounded border px-2 py-1 text-sm"
            value={form.season_year}
            onChange={(e) => setForm({ ...form, season_year: e.target.value })}
          />
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Min races to qualify (optional)
            <input
              type="number"
              min="1"
              placeholder="None"
              className="rounded border px-2 py-1 text-sm"
              value={form.min_races_to_qualify}
              onChange={(e) => setForm({ ...form, min_races_to_qualify: e.target.value })}
            />
          </label>
          <div className="flex gap-2 self-end">
            <button type="submit" className="flex-1 rounded bg-brand-600 px-3 py-1.5 text-sm text-white">
              {editing ? 'Save changes' : 'Create Series'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Throwout progressive disclosure */}
        <div className="mt-3 border-t pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.throwouts_enabled}
              onChange={(e) => setForm({ ...form, throwouts_enabled: e.target.checked })}
            />
            Allow throwouts
          </label>

          {form.throwouts_enabled && (
            <div className="mt-2 space-y-2 pl-6">
              {form.throwout_tiers.map((tier, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  {i > 0 && <span className="text-slate-400">then</span>}
                  <span>Allow</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="N"
                    className="w-14 rounded border px-2 py-1 text-sm"
                    value={tier.throwouts}
                    onChange={(e) => updateTier(i, 'throwouts', e.target.value)}
                  />
                  <span>throwout(s) after</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="M"
                    className="w-16 rounded border px-2 py-1 text-sm"
                    value={tier.after_races}
                    onChange={(e) => updateTier(i, 'after_races', e.target.value)}
                  />
                  <span>races sailed</span>
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => removeTier(i)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      remove
                    </button>
                  )}
                </div>
              ))}
              {form.throwout_tiers.length < 2 && (
                <button type="button" onClick={addTier} className="text-xs text-brand-600 hover:underline">
                  + add tier
                </button>
              )}
            </div>
          )}
        </div>

        {/* Race assignment — only in edit mode */}
        {editing && allRaces !== null && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Races in this series
            </p>
            {allRaces.length === 0 ? (
              <p className="text-sm text-slate-400">No races yet.</p>
            ) : (
              <ul className="space-y-1">
                {allRaces.map((r) => (
                  <li key={r.race_id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.series_id === editing.series_id}
                        onChange={() => toggleRaceAssignment(r.race_id, r.series_id)}
                      />
                      <span className={r.series_id && r.series_id !== editing.series_id ? 'text-slate-300' : ''}>
                        {r.name}
                      </span>
                      <span className="text-slate-400">
                        · {String(r.race_date).slice(0, 10)} · {r.status}
                      </span>
                      {r.series_id && r.series_id !== editing.series_id && (
                        <span className="text-xs text-amber-600">(other series)</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>

      <AsyncBoundary state={state}>
        {(series) => (
          <ul className="divide-y rounded border bg-white">
            {series.map((s) => (
              <li
                key={s.series_id}
                className={`flex items-center justify-between p-3 ${editing?.series_id === s.series_id ? 'bg-brand-50' : ''}`}
              >
                <span>
                  <strong>{s.name}</strong>{' '}
                  <span className="text-slate-400">· {s.season_year}</span>
                  {s.throwouts_enabled && s.throwout_tiers?.length > 0 && (
                    <span className="ml-2 text-xs text-slate-500">
                      (
                      {s.throwout_tiers
                        .map((t) => `${t.throwouts} drop after ${t.after_races}`)
                        .join(', then ')}
                      )
                    </span>
                  )}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditing(s)}
                    className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => recalc(s.series_id)}
                    className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
                  >
                    Recalculate standings
                  </button>
                </div>
              </li>
            ))}
            {series.length === 0 && <li className="p-3 text-slate-500">No series yet.</li>}
          </ul>
        )}
      </AsyncBoundary>

      {standings && (
        <section className="mt-6 rounded border bg-white p-4">
          <h2 className="mb-4 text-lg font-semibold">{standings.series.name} — Standings</h2>
          {fleetSections.length === 0 || fleetSections.every((fs) => fs.standings.length === 0) ? (
            <p className="text-slate-500">No scored races yet.</p>
          ) : (
            fleetSections.map((fs, i) => (
              <div key={fs.fleetName || i} className={i > 0 ? 'mt-6' : ''}>
                {fs.fleetName && (
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    {fs.fleetName}
                  </h3>
                )}
                <StandingsTable races={standings.races} standings={fs.standings} />
              </div>
            ))
          )}
        </section>
      )}
    </AdminLayout>
  );
}
