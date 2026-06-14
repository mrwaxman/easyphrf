import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { RaceResultsView } from '../../components/RaceResultsView.jsx';
import { FINISH_STATUSES, FINISH_STATUS_LABELS } from '@easyphrf/shared';

const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');

function buildGunDateTime(raceDate, timeOfDay) {
  const d = String(raceDate).slice(0, 10);
  return new Date(`${d}T${timeOfDay}:00`);
}

export default function Results() {
  const { id } = useParams();
  const apiC = useApi();
  const [race, setRace] = useState(null);
  const [entries, setEntries] = useState([]);
  const [startTime, setStartTime] = useState(''); // shared gun time (HH:mm)
  const [splitStarts, setSplitStarts] = useState(false);
  const [fleetStarts, setFleetStarts] = useState(new Map()); // fleet_id → HH:mm
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [entryErrors, setEntryErrors] = useState(new Map());

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([apiC.getRace(id), apiC.listEntries(id)]);
    setRace(r);
    const raceDate = String(r.race_date).slice(0, 10);
    const shared = r.start_time_of_day || '12:00';
    setStartTime(shared);
    // Initialize per-fleet start times from loaded fleet data.
    const fMap = new Map((r.fleets || []).map((f) => [f.fleet_id, f.start_time_of_day || shared]));
    setFleetStarts(fMap);
    setSplitStarts(false);
    setEntries(
      e.map((x) => ({
        ...x,
        finish_time: x.finish_time_local || `${raceDate}T12:00`,
        self_start_time: x.self_start_time_local || `${raceDate}T12:00`,
      }))
    );
    if (['published', 'revised'].includes(r.status)) setPreview(r);
  }, [apiC, id]);

  useEffect(() => {
    load();
  }, [load]);

  const selfTimed = race && race.start_type === 'self_timed';
  const isSimultaneous = race && race.start_type === 'simultaneous';
  const multiFleet = isSimultaneous && (race.fleets?.length ?? 0) > 1;

  const handleToggleSplit = (checked) => {
    if (checked) {
      // Seed each fleet's field from the current shared time so the admin only
      // needs to adjust the fleet(s) that actually differ.
      const next = new Map();
      for (const [fid] of fleetStarts) next.set(fid, startTime);
      setFleetStarts(next);
    }
    setSplitStarts(checked);
  };

  const saveStart = async () => {
    if (splitStarts && multiFleet) {
      await Promise.all(
        (race.fleets || []).map((f) =>
          apiC.updateFleet(id, f.fleet_id, {
            start_time_of_day: fleetStarts.get(f.fleet_id) || null,
          })
        )
      );
    } else {
      await apiC.updateRace(id, {
        start_time_of_day: startTime || null,
        race_date: dateOnly(race.race_date),
      });
    }
  };

  const updateEntry = (eid, patch) => {
    setEntries((prev) => prev.map((e) => (e.entry_id === eid ? { ...e, ...patch } : e)));
    setEntryErrors((prev) => {
      const next = new Map(prev);
      next.delete(eid);
      return next;
    });
  };

  const validateEntries = () => {
    const errors = new Map();
    for (const e of entries) {
      if (!e.finish_time || e.finish_status !== 'finished') continue;
      const finish = new Date(e.finish_time);
      let start = null;
      if (isSimultaneous) {
        const fleetTime = splitStarts && multiFleet ? fleetStarts.get(e.fleet_id) : startTime;
        start = buildGunDateTime(race.race_date, fleetTime || startTime);
      } else if (race.start_type === 'self_timed') {
        start = e.self_start_time ? new Date(e.self_start_time) : null;
      }
      if (start && finish <= start) {
        errors.set(e.entry_id, 'Finish time must be after the start time.');
      }
    }
    return errors;
  };

  const persistEntry = async (e) => {
    await apiC.updateEntry(id, e.entry_id, {
      finish_time: e.finish_time || null,
      self_start_time: e.self_start_time || null,
      finish_status: e.finish_status,
    });
  };

  const saveStartOnly = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await saveStart();
    } catch {
      setError('Could not save the start time. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const calculate = async () => {
    if (busy) return;
    setError(null);
    const errors = validateEntries();
    setEntryErrors(errors);
    if (errors.size > 0) return;
    setBusy(true);
    try {
      if (isSimultaneous) await saveStart();
      await Promise.all(entries.map(persistEntry));
      const detail = await apiC.scoreRace(id);
      setPreview(detail);
    } catch {
      setError('Could not calculate results. Check the times and try again.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setError(null);
    try {
      await apiC.publishRace(id);
      load();
    } catch {
      setError('Could not publish the race. Please try again.');
    }
  };

  const revise = async () => {
    const notes = window.prompt('Revision note (required):');
    if (!notes) return;
    try {
      await apiC.reviseRace(id, notes);
      load();
    } catch {
      setError('Could not save the revision. Please try again.');
    }
  };

  if (!race) return <p className="text-slate-400">Loading…</p>;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Results — {race.name}</h1>
      <p className="mb-4 text-sm text-slate-500">Status: {race.status}</p>
      {error && <p className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-700">{error}</p>}

      {isSimultaneous && (
        <div className="mb-4 rounded border bg-white p-4">
          {/* Multi-fleet toggle — only shown when there are 2+ fleets */}
          {multiFleet && (
            <div className="mb-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={splitStarts}
                  onChange={(e) => handleToggleSplit(e.target.checked)}
                />
                Fleets start at different times
              </label>
            </div>
          )}

          {splitStarts && multiFleet ? (
            /* Per-fleet start time inputs */
            <div className="space-y-2">
              {(race.fleets || []).map((f) => (
                <label key={f.fleet_id} className="flex items-center gap-3 text-sm">
                  <span className="w-32 font-medium">{f.name}</span>
                  <input
                    type="time"
                    step="1"
                    className="rounded border px-2 py-1"
                    value={fleetStarts.get(f.fleet_id) || ''}
                    onChange={(ev) => {
                      const next = new Map(fleetStarts);
                      next.set(f.fleet_id, ev.target.value);
                      setFleetStarts(next);
                    }}
                  />
                </label>
              ))}
              <button
                onClick={saveStartOnly}
                disabled={busy}
                className="mt-1 rounded border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save start times'}
              </button>
            </div>
          ) : (
            /* Single shared start time input */
            <div className="flex items-end gap-2">
              <label className="text-sm">
                <span className="text-slate-500">Actual start (gun) time</span>
                <input
                  type="time"
                  step="1"
                  className="mt-1 block rounded border px-2 py-1"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              <button
                onClick={saveStartOnly}
                disabled={busy}
                className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save start time'}
              </button>
            </div>
          )}

          <p className="mt-2 text-xs text-slate-400">
            {splitStarts && multiFleet
              ? "Each fleet's elapsed time is measured from its own gun. Entered in the club's local time."
              : 'Elapsed time is measured from this gun time (club local). Defaults to the scheduled start from setup — edit it here if the actual start differed.'}
          </p>
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
                  <input type="datetime-local" step="1" className="rounded border px-1 py-0.5" value={e.self_start_time} onChange={(ev) => updateEntry(e.entry_id, { self_start_time: ev.target.value })} />
                </td>
              )}
              <td className="px-2 py-1">
                <input type="datetime-local" step="1" className="rounded border px-1 py-0.5" value={e.finish_time} onChange={(ev) => updateEntry(e.entry_id, { finish_time: ev.target.value })} />
                {entryErrors.get(e.entry_id) && (
                  <p className="text-xs text-amber-700">{entryErrors.get(e.entry_id)}</p>
                )}
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
        <button onClick={calculate} disabled={busy} className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {busy ? 'Working…' : 'Calculate Results'}
        </button>
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
    </>
  );
}
