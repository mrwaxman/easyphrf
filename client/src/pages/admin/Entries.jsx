import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';

const BLANK_FLEET = { name: '', fleet_type: 'phrf', phrf_min: '', phrf_max: '', uses_spinnaker: 'optional' };

export default function Entries() {
  const { id } = useParams();
  const apiC = useApi();
  const [race, setRace] = useState(null);
  const [boats, setBoats] = useState([]);
  const [entries, setEntries] = useState([]);
  const [sel, setSel] = useState({ boat_id: '', fleet_id: '', no_spinnaker: false, phrf_override: '' });
  const [error, setError] = useState(null);
  const [showFleetForm, setShowFleetForm] = useState(false);
  const [newFleet, setNewFleet] = useState(BLANK_FLEET);

  const load = useCallback(async () => {
    const [r, b, e] = await Promise.all([apiC.getRace(id), apiC.listBoats(), apiC.listEntries(id)]);
    setRace(r);
    setBoats(b.filter((x) => x.active));
    setEntries(e);
    // Default fleet_id to the first (or only) fleet whenever it's unset.
    if ((r.fleets || []).length > 0) {
      setSel((prev) => ({ ...prev, fleet_id: prev.fleet_id || r.fleets[0].fleet_id }));
    }
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
        no_spinnaker: sel.no_spinnaker,
        phrf_override: sel.phrf_override === '' ? null : Number(sel.phrf_override),
      });
      setSel({ boat_id: '', fleet_id: '', no_spinnaker: false, phrf_override: '' }); // load() re-defaults fleet_id
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (eid) => {
    await apiC.deleteEntry(id, eid);
    load();
  };

  const addFleet = async () => {
    setError(null);
    if (!newFleet.name) {
      setError('Give the fleet a name');
      return;
    }
    try {
      await apiC.addFleet(id, {
        ...newFleet,
        phrf_min: newFleet.phrf_min === '' ? null : Number(newFleet.phrf_min),
        phrf_max: newFleet.phrf_max === '' ? null : Number(newFleet.phrf_max),
      });
      setNewFleet(BLANK_FLEET);
      setShowFleetForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!race) return <p className="text-slate-400">Loading…</p>;

  const singleFleet = (race.fleets || []).length === 1;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Entries — {race.name}</h1>
      <p className="mb-4 text-sm text-slate-500">{entries.length} entered</p>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className={`mb-4 grid grid-cols-2 gap-2 rounded border bg-white p-4 ${singleFleet ? 'md:grid-cols-4' : 'md:grid-cols-5'}`}>
        <select className="rounded border px-2 py-1 text-sm" value={sel.boat_id} onChange={(e) => setSel({ ...sel, boat_id: e.target.value })}>
          <option value="">Select boat…</option>
          {boats.map((b) => (
            <option key={b.boat_id} value={b.boat_id}>{b.sail_number} — {b.boat_name}</option>
          ))}
        </select>
        {!singleFleet && (
          <select className="rounded border px-2 py-1 text-sm" value={sel.fleet_id} onChange={(e) => setSel({ ...sel, fleet_id: e.target.value })}>
            <option value="">Select fleet…</option>
            {(race.fleets || []).map((f) => (
              <option key={f.fleet_id} value={f.fleet_id}>{f.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={sel.no_spinnaker} onChange={(e) => setSel({ ...sel, no_spinnaker: e.target.checked })} />
          Non-spin
        </label>
        <input placeholder="PHRF override" className="rounded border px-2 py-1 text-sm" value={sel.phrf_override} onChange={(e) => setSel({ ...sel, phrf_override: e.target.value })} />
        <button onClick={add} className="rounded bg-brand-600 px-3 py-1 text-sm text-white">Add entry</button>
      </div>

      <div className="mb-4">
        {!showFleetForm && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <button onClick={() => setShowFleetForm(true)} className="font-medium text-brand-600 hover:underline">
              + Add a fleet
            </button>
            {(race.fleets || []).length === 1 && (
              <span className="text-slate-500">
                Split boats across fleets — e.g. an A fleet under 100 PHRF and a B fleet 100+.
              </span>
            )}
          </div>
        )}
        {showFleetForm && (
          <div className="rounded border bg-white p-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <input placeholder="Fleet name" className="rounded border px-2 py-1 text-sm" value={newFleet.name} onChange={(e) => setNewFleet({ ...newFleet, name: e.target.value })} />
              <select className="rounded border px-2 py-1 text-sm" value={newFleet.fleet_type} onChange={(e) => setNewFleet({ ...newFleet, fleet_type: e.target.value })}>
                <option value="phrf">PHRF</option>
                <option value="one_design">One-design</option>
              </select>
              <input placeholder="PHRF min" className="rounded border px-2 py-1 text-sm" value={newFleet.phrf_min} onChange={(e) => setNewFleet({ ...newFleet, phrf_min: e.target.value })} />
              <input placeholder="PHRF max" className="rounded border px-2 py-1 text-sm" value={newFleet.phrf_max} onChange={(e) => setNewFleet({ ...newFleet, phrf_max: e.target.value })} />
              <select className="rounded border px-2 py-1 text-sm" value={newFleet.uses_spinnaker} onChange={(e) => setNewFleet({ ...newFleet, uses_spinnaker: e.target.value })}>
                <option value="optional">Spinnaker optional</option>
                <option value="allowed">Spinnaker allowed</option>
                <option value="not_allowed">No spinnaker</option>
              </select>
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={addFleet} className="rounded bg-brand-600 px-3 py-1 text-sm text-white">Add fleet</button>
              <button onClick={() => { setShowFleetForm(false); setNewFleet(BLANK_FLEET); setError(null); }} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        )}
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
            <th className="px-2 py-1">Sail #</th>
            <th className="px-2 py-1">Boat</th>
            {!singleFleet && <th className="px-2 py-1">Fleet</th>}
            <th className="px-2 py-1">Non-spin</th>
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
                {!singleFleet && <td className="px-2 py-1">{fleet ? fleet.name : '—'}</td>}
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={!!e.no_spinnaker}
                    onChange={async (ev) => {
                      await apiC.updateEntry(id, e.entry_id, { no_spinnaker: ev.target.checked });
                      load();
                    }}
                  />
                </td>
                <td className="px-2 py-1">{e.phrf_override ?? ''}</td>
                <td className="px-2 py-1 text-right">
                  <button onClick={() => remove(e.entry_id)} className="text-red-600 hover:underline">Remove</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
