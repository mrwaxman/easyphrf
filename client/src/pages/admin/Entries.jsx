import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';

export default function Entries() {
  const { id } = useParams();
  const apiC = useApi();
  const [race, setRace] = useState(null);
  const [boats, setBoats] = useState([]);
  const [entries, setEntries] = useState([]);
  const [sel, setSel] = useState({ boat_id: '', fleet_id: '', using_spinnaker: false, phrf_override: '' });
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [r, b, e] = await Promise.all([apiC.getRace(id), apiC.listBoats(), apiC.listEntries(id)]);
    setRace(r);
    setBoats(b.filter((x) => x.active));
    setEntries(e);
  }, [apiC, id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setError(null);
    if (!sel.boat_id || !sel.fleet_id) {
      setError('Pick a boat and a fleet');
      return;
    }
    try {
      await apiC.addEntry(id, {
        boat_id: sel.boat_id,
        fleet_id: sel.fleet_id,
        using_spinnaker: sel.using_spinnaker,
        phrf_override: sel.phrf_override === '' ? null : Number(sel.phrf_override),
      });
      setSel({ boat_id: '', fleet_id: '', using_spinnaker: false, phrf_override: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (eid) => {
    await apiC.deleteEntry(id, eid);
    load();
  };

  if (!race) return <AdminLayout><p className="text-slate-400">Loading…</p></AdminLayout>;

  return (
    <AdminLayout>
      <h1 className="mb-1 text-2xl font-bold">Entries — {race.name}</h1>
      <p className="mb-4 text-sm text-slate-500">{entries.length} entered</p>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="mb-4 grid grid-cols-2 gap-2 rounded border bg-white p-4 md:grid-cols-5">
        <select className="rounded border px-2 py-1 text-sm" value={sel.boat_id} onChange={(e) => setSel({ ...sel, boat_id: e.target.value })}>
          <option value="">Select boat…</option>
          {boats.map((b) => (
            <option key={b.boat_id} value={b.boat_id}>{b.sail_number} — {b.boat_name}</option>
          ))}
        </select>
        <select className="rounded border px-2 py-1 text-sm" value={sel.fleet_id} onChange={(e) => setSel({ ...sel, fleet_id: e.target.value })}>
          <option value="">Select fleet…</option>
          {(race.fleets || []).map((f) => (
            <option key={f.fleet_id} value={f.fleet_id}>{f.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={sel.using_spinnaker} onChange={(e) => setSel({ ...sel, using_spinnaker: e.target.checked })} />
          Spinnaker
        </label>
        <input placeholder="PHRF override" className="rounded border px-2 py-1 text-sm" value={sel.phrf_override} onChange={(e) => setSel({ ...sel, phrf_override: e.target.value })} />
        <button onClick={add} className="rounded bg-brand-600 px-3 py-1 text-sm text-white">Add entry</button>
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
            <th className="px-2 py-1">Sail #</th>
            <th className="px-2 py-1">Boat</th>
            <th className="px-2 py-1">Fleet</th>
            <th className="px-2 py-1">Spin</th>
            <th className="px-2 py-1">Override</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const fleet = (race.fleets || []).find((f) => f.fleet_id === e.fleet_id);
            return (
              <tr key={e.entry_id} className="border-b">
                <td className="px-2 py-1">{e.sail_number}</td>
                <td className="px-2 py-1 font-medium">{e.boat_name}</td>
                <td className="px-2 py-1">{fleet ? fleet.name : '—'}</td>
                <td className="px-2 py-1">{e.using_spinnaker ? '✓' : ''}</td>
                <td className="px-2 py-1">{e.phrf_override ?? ''}</td>
                <td className="px-2 py-1 text-right">
                  <button onClick={() => remove(e.entry_id)} className="text-red-600 hover:underline">Remove</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </AdminLayout>
  );
}
