import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';
import { RaceResultsView } from '../../components/RaceResultsView.jsx';
import { FINISH_STATUSES, FINISH_STATUS_LABELS } from '@easyphrf/shared';

// datetime-local wants "YYYY-MM-DDTHH:mm"; trim a stored ISO timestamp to fit.
const toLocal = (v) => (v ? String(v).slice(0, 16) : '');

export default function Results() {
  const { id } = useParams();
  const apiC = useApi();
  const [race, setRace] = useState(null);
  const [entries, setEntries] = useState([]);
  const [startTime, setStartTime] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([apiC.getRace(id), apiC.listEntries(id)]);
    setRace(r);
    setStartTime(toLocal(r.start_time));
    setEntries(e);
    if (['published', 'revised'].includes(r.status)) setPreview(r);
  }, [apiC, id]);

  useEffect(() => {
    load();
  }, [load]);

  const selfTimed = race && race.start_type === 'self_timed';

  const saveStart = async () => {
    await apiC.updateRace(id, { start_time: startTime || null });
  };

  const updateEntry = (eid, patch) =>
    setEntries((prev) => prev.map((e) => (e.entry_id === eid ? { ...e, ...patch } : e)));

  const persistEntry = async (e) => {
    await apiC.updateEntry(id, e.entry_id, {
      finish_time: e.finish_time || null,
      self_start_time: e.self_start_time || null,
      finish_status: e.finish_status,
    });
  };

  const calculate = async () => {
    setError(null);
    try {
      if (race.start_type === 'simultaneous' && startTime) await saveStart();
      await Promise.all(entries.map(persistEntry));
      const detail = await apiC.scoreRace(id);
      setPreview(detail);
    } catch (err) {
      setError(err.message);
    }
  };

  const publish = async () => {
    await apiC.publishRace(id);
    load();
  };

  const revise = async () => {
    const notes = window.prompt('Revision note (required):');
    if (!notes) return;
    await apiC.reviseRace(id, notes);
    load();
  };

  if (!race) return <AdminLayout><p className="text-slate-400">Loading…</p></AdminLayout>;

  return (
    <AdminLayout>
      <h1 className="mb-1 text-2xl font-bold">Results — {race.name}</h1>
      <p className="mb-4 text-sm text-slate-500">Status: {race.status}</p>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {race.start_type === 'simultaneous' && (
        <div className="mb-4 flex items-end gap-2 rounded border bg-white p-4">
          <label className="text-sm">
            <span className="text-slate-500">Race start time</span>
            <input type="datetime-local" className="mt-1 block rounded border px-2 py-1" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <button onClick={saveStart} className="rounded border px-3 py-1.5 text-sm">Save start time</button>
        </div>
      )}

      <table className="mb-4 w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
            <th className="px-2 py-1">Boat</th>
            {selfTimed && <th className="px-2 py-1">Self start</th>}
            <th className="px-2 py-1">Finish</th>
            <th className="px-2 py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.entry_id} className="border-b">
              <td className="px-2 py-1 font-medium">{e.boat_name} <span className="text-slate-400">{e.sail_number}</span></td>
              {selfTimed && (
                <td className="px-2 py-1">
                  <input type="datetime-local" className="rounded border px-1 py-0.5" value={toLocal(e.self_start_time)} onChange={(ev) => updateEntry(e.entry_id, { self_start_time: ev.target.value })} />
                </td>
              )}
              <td className="px-2 py-1">
                <input type="datetime-local" className="rounded border px-1 py-0.5" value={toLocal(e.finish_time)} onChange={(ev) => updateEntry(e.entry_id, { finish_time: ev.target.value })} />
              </td>
              <td className="px-2 py-1">
                <select className="rounded border px-1 py-0.5" value={e.finish_status} onChange={(ev) => updateEntry(e.entry_id, { finish_status: ev.target.value })}>
                  {FINISH_STATUSES.map((s) => (
                    <option key={s} value={s}>{FINISH_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 flex gap-2">
        <button onClick={calculate} className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white">Calculate Results</button>
        {['draft', 'open'].includes(race.status) && (
          <button onClick={publish} className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white">Publish</button>
        )}
        {['published', 'revised'].includes(race.status) && (
          <button onClick={revise} className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white">Revise Results</button>
        )}
      </div>

      {preview && (
        <div className="rounded border bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">Preview</h2>
          <RaceResultsView race={preview} />
        </div>
      )}
    </AdminLayout>
  );
}
