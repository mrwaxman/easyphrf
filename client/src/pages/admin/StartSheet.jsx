import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';

const fmtInterval = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtTime = (iso, tz) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-US', {
        timeZone: tz || undefined,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

/** Inline control shown when a pursuit race has no start time set yet. */
function SetStartTime({ raceId, raceDate, onSaved }) {
  const apiC = useApi();
  const [time, setTime] = useState('12:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (saving) return;
    if (!time) {
      setError('Enter a start time first.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiC.updateRace(raceId, { start_time_of_day: time, race_date: raceDate });
      onSaved();
    } catch {
      setError('Could not save the start time. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="rounded border bg-white p-4 no-print">
      <h2 className="mb-1 text-lg font-semibold">Set the start time</h2>
      <p className="mb-3 text-sm text-slate-500">
        Pursuit start times are computed from the gun time. Enter the scheduled start
        {raceDate ? ` for ${raceDate}` : ''} (club local time) to generate the sheet.
      </p>
      {error && <p className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-700">{error}</p>}
      <div className="flex items-end gap-2">
        <label className="text-sm">
          <span className="text-slate-500">Start time</span>
          <input
            type="time"
            className="mt-1 block rounded border px-2 py-1"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & generate'}
        </button>
      </div>
    </div>
  );
}

export default function StartSheet() {
  const { id } = useParams();
  const apiC = useApi();
  const state = useAsync(() => apiC.startSheet(id), [id]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold">Pursuit Start Sheet</h1>
        <button onClick={() => window.print()} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
          Print / Download
        </button>
      </div>
      <AsyncBoundary state={state}>
        {(data) =>
          data.needs_start_time ? (
            <SetStartTime raceId={id} raceDate={data.race_date} onSaved={state.reload} />
          ) : (
            <table className="w-full border-collapse rounded border bg-white text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="px-2 py-1">Order</th>
                  <th className="px-2 py-1">Boat</th>
                  <th className="px-2 py-1">Sail #</th>
                  <th className="px-2 py-1">PHRF</th>
                  <th className="px-2 py-1">Delay</th>
                  <th className="px-2 py-1">Start time</th>
                </tr>
              </thead>
              <tbody>
                {data.starts.map((s, i) => (
                  <tr key={s.boatId} className="border-b">
                    <td className="px-2 py-1">{i + 1}</td>
                    <td className="px-2 py-1 font-medium">{s.boat_name}</td>
                    <td className="px-2 py-1">{s.sail_number}</td>
                    <td className="px-2 py-1">{s.phrf}</td>
                    <td className="px-2 py-1">{fmtInterval(s.intervalSeconds)}</td>
                    <td className="px-2 py-1">{fmtTime(s.startTime, data.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </AsyncBoundary>
    </>
  );
}
