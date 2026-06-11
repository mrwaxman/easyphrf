import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';

const BLANK_RACE = {
  name: '',
  race_date: '',
  start_type: 'simultaneous',
  self_timed_mode: 'fully_independent',
  race_distance: '',
  time_limit_secs: '',
  series_id: '',
};
const BLANK_FLEET = { name: '', fleet_type: 'phrf', phrf_min: '', phrf_max: '', uses_spinnaker: 'optional' };

export default function RaceSetup() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const apiC = useApi();

  const [race, setRace] = useState(BLANK_RACE);
  const [fleets, setFleets] = useState([]);
  const [newFleet, setNewFleet] = useState(BLANK_FLEET);
  const [error, setError] = useState(null);
  const seriesState = useAsync(() => apiC.listSeries(), []);

  useEffect(() => {
    if (!editing) return;
    apiC.getRace(id).then((r) => {
      setRace({
        name: r.name || '',
        race_date: String(r.race_date || '').slice(0, 10),
        start_type: r.start_type,
        self_timed_mode: r.self_timed_mode || 'fully_independent',
        race_distance: r.race_distance ?? '',
        time_limit_secs: r.time_limit_secs ?? '',
        series_id: r.series_id || '',
      });
      setFleets(r.fleets || []);
    });
  }, [id, editing, apiC]);

  const saveRace = async (e) => {
    e.preventDefault();
    setError(null);
    const body = {
      name: race.name,
      race_date: race.race_date,
      start_type: race.start_type,
      self_timed_mode: race.start_type === 'self_timed' ? race.self_timed_mode : null,
      race_distance: race.race_distance === '' ? null : Number(race.race_distance),
      time_limit_secs: race.time_limit_secs === '' ? null : Number(race.time_limit_secs),
      series_id: race.series_id || null,
    };
    try {
      if (editing) {
        await apiC.updateRace(id, body);
      } else {
        const created = await apiC.createRace(body);
        navigate(`/admin/races/${created.race_id}/edit`);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const addFleet = async () => {
    const body = {
      ...newFleet,
      phrf_min: newFleet.phrf_min === '' ? null : Number(newFleet.phrf_min),
      phrf_max: newFleet.phrf_max === '' ? null : Number(newFleet.phrf_max),
    };
    const created = await apiC.addFleet(id, body);
    setFleets([...fleets, created]);
    setNewFleet(BLANK_FLEET);
  };

  const removeFleet = async (fid) => {
    await apiC.deleteFleet(id, fid);
    setFleets(fleets.filter((f) => f.fleet_id !== fid));
  };

  return (
    <AdminLayout>
      <h1 className="mb-4 text-2xl font-bold">{editing ? 'Edit Race' : 'New Race'}</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={saveRace} className="mb-6 grid grid-cols-2 gap-3 rounded border bg-white p-4">
        <label className="text-sm">
          <span className="text-slate-500">Name</span>
          <input className="mt-1 w-full rounded border px-2 py-1" value={race.name} onChange={(e) => setRace({ ...race, name: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Date</span>
          <input type="date" className="mt-1 w-full rounded border px-2 py-1" value={race.race_date} onChange={(e) => setRace({ ...race, race_date: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Start type</span>
          <select className="mt-1 w-full rounded border px-2 py-1" value={race.start_type} onChange={(e) => setRace({ ...race, start_type: e.target.value })}>
            <option value="simultaneous">Simultaneous</option>
            <option value="pursuit">Pursuit</option>
            <option value="self_timed">Self-timed</option>
          </select>
        </label>
        {race.start_type === 'self_timed' && (
          <label className="text-sm">
            <span className="text-slate-500">Self-timed mode</span>
            <select className="mt-1 w-full rounded border px-2 py-1" value={race.self_timed_mode} onChange={(e) => setRace({ ...race, self_timed_mode: e.target.value })}>
              <option value="fully_independent">Fully independent</option>
              <option value="rc_finish_self_start">RC finish / self start</option>
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="text-slate-500">Distance (nm)</span>
          <input className="mt-1 w-full rounded border px-2 py-1" value={race.race_distance} onChange={(e) => setRace({ ...race, race_distance: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Time limit (secs)</span>
          <input className="mt-1 w-full rounded border px-2 py-1" value={race.time_limit_secs} onChange={(e) => setRace({ ...race, time_limit_secs: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Series</span>
          <select className="mt-1 w-full rounded border px-2 py-1" value={race.series_id} onChange={(e) => setRace({ ...race, series_id: e.target.value })}>
            <option value="">— none —</option>
            {(seriesState.data || []).map((s) => (
              <option key={s.series_id} value={s.series_id}>{s.name} ({s.season_year})</option>
            ))}
          </select>
        </label>
        <div className="col-span-full">
          <button type="submit" className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white">Save as Draft</button>
        </div>
      </form>

      {editing && (
        <section className="rounded border bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">Fleets</h2>
          <ul className="mb-3 divide-y">
            {fleets.map((f) => (
              <li key={f.fleet_id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <strong>{f.name}</strong> · {f.fleet_type}
                  {f.fleet_type === 'phrf' && (f.phrf_min != null || f.phrf_max != null) && ` · ${f.phrf_min ?? '–'}…${f.phrf_max ?? '–'}`}
                  {' · '}spin: {f.uses_spinnaker}
                </span>
                <button onClick={() => removeFleet(f.fleet_id)} className="text-red-600 hover:underline">Remove</button>
              </li>
            ))}
            {fleets.length === 0 && <li className="py-2 text-slate-500">No fleets yet.</li>}
          </ul>
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
          <button onClick={addFleet} className="mt-2 rounded border px-3 py-1.5 text-sm hover:bg-slate-50">Add fleet</button>
        </section>
      )}
    </AdminLayout>
  );
}
