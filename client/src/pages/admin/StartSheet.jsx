import { useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString() : '—');
const fmtInterval = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function StartSheet() {
  const { id } = useParams();
  const apiC = useApi();
  const state = useAsync(() => apiC.startSheet(id), [id]);

  return (
    <AdminLayout>
      <div className="mb-4 flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold">Pursuit Start Sheet</h1>
        <button onClick={() => window.print()} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
          Print / Download
        </button>
      </div>
      <AsyncBoundary state={state}>
        {(data) => (
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
                  <td className="px-2 py-1">{fmtTime(s.startTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncBoundary>
    </AdminLayout>
  );
}
