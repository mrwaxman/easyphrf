import { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminLayout } from '../../components/AdminLayout.jsx';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';
import { InferredBadge } from '../../components/Badges.jsx';

const EMPTY = {
  sail_number: '',
  boat_name: '',
  model: '',
  skipper_name: '',
  phrf_base: '',
  phrf_spinnaker: '',
  rating_source: 'official',
};

export default function Boats() {
  const apiC = useApi();
  const state = useAsync(() => apiC.listBoats(), []);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null); // null = closed; object = editing/adding
  const [editId, setEditId] = useState(null);
  const [importRows, setImportRows] = useState(null);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    const body = {
      ...form,
      phrf_base: Number(form.phrf_base),
      phrf_spinnaker: Number(form.phrf_spinnaker),
    };
    try {
      if (editId) await apiC.updateBoat(editId, body);
      else await apiC.createBoat(body);
      setForm(null);
      setEditId(null);
      state.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const onImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    try {
      const res = await apiC.importPdf(file);
      setImportRows(res.records);
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmImport = async () => {
    await apiC.confirmImport(importRows);
    setImportRows(null);
    state.reload();
  };

  const filtered = (boats) =>
    boats.filter((b) =>
      `${b.sail_number} ${b.boat_name} ${b.skipper_name} ${b.model || ''}`.toLowerCase().includes(query.toLowerCase())
    );

  return (
    <AdminLayout>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Boats</h1>
        <div className="flex gap-2">
          <label className="cursor-pointer rounded border px-3 py-2 text-sm hover:bg-slate-50">
            Import from PDF
            <input type="file" accept="application/pdf" className="hidden" onChange={onImport} />
          </label>
          <button
            onClick={() => {
              setForm(EMPTY);
              setEditId(null);
            }}
            className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add Boat
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {importRows && (
        <div className="mb-4 rounded border bg-white p-3">
          <p className="mb-2 font-semibold">Import preview ({importRows.length} rows)</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th>Sail</th><th>Boat</th><th>Model</th><th>Skipper</th><th>Base</th><th>Spin</th>
              </tr>
            </thead>
            <tbody>
              {importRows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td>{r.sail_number}</td><td>{r.boat_name}</td><td>{r.model}</td>
                  <td>{r.skipper_name}</td><td>{r.phrf_base}</td><td>{r.phrf_spinnaker}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-2">
            <button onClick={confirmImport} className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white">
              Confirm import
            </button>
            <button onClick={() => setImportRows(null)} className="rounded border px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {form && (
        <form onSubmit={save} className="mb-4 grid grid-cols-2 gap-3 rounded border bg-white p-4 md:grid-cols-3">
          {[
            ['sail_number', 'Sail #'],
            ['boat_name', 'Boat name'],
            ['model', 'Model'],
            ['skipper_name', 'Skipper'],
            ['phrf_base', 'Base PHRF'],
            ['phrf_spinnaker', 'Spinnaker PHRF'],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="text-slate-500">{label}</span>
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="text-sm">
            <span className="text-slate-500">Rating source</span>
            <select
              className="mt-1 w-full rounded border px-2 py-1"
              value={form.rating_source}
              onChange={(e) => setForm({ ...form, rating_source: e.target.value })}
            >
              <option value="official">Official</option>
              <option value="inferred">Inferred</option>
            </select>
          </label>
          <div className="col-span-full flex gap-2">
            <button type="submit" className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white">
              {editId ? 'Save changes' : 'Create boat'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded border px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      <input
        placeholder="Search boats…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3 w-full rounded border px-3 py-2 text-sm"
      />

      <AsyncBoundary state={state}>
        {(boats) => (
          <table className="w-full border-collapse rounded border bg-white text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-2 py-1">Sail #</th>
                <th className="px-2 py-1">Boat</th>
                <th className="px-2 py-1">Model</th>
                <th className="px-2 py-1">Skipper</th>
                <th className="px-2 py-1">Base</th>
                <th className="px-2 py-1">Spin</th>
                <th className="px-2 py-1">Source</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {filtered(boats).map((b) => (
                <tr key={b.boat_id} className={`border-b ${b.active ? '' : 'opacity-50'}`}>
                  <td className="px-2 py-1">{b.sail_number}</td>
                  <td className="px-2 py-1 font-medium">{b.boat_name}</td>
                  <td className="px-2 py-1">{b.model}</td>
                  <td className="px-2 py-1">{b.skipper_name}</td>
                  <td className="px-2 py-1">{b.phrf_base}</td>
                  <td className="px-2 py-1">{b.phrf_spinnaker}</td>
                  <td className="px-2 py-1">
                    {b.rating_source === 'inferred' ? (
                      <span className="text-amber-600">Inferred<InferredBadge /></span>
                    ) : (
                      'Official'
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      className="mr-2 text-brand-600 hover:underline"
                      onClick={() => {
                        setEditId(b.boat_id);
                        setForm({
                          sail_number: b.sail_number,
                          boat_name: b.boat_name,
                          model: b.model || '',
                          skipper_name: b.skipper_name,
                          phrf_base: b.phrf_base,
                          phrf_spinnaker: b.phrf_spinnaker,
                          rating_source: b.rating_source,
                        });
                      }}
                    >
                      Edit
                    </button>
                    {b.active && (
                      <button
                        className="text-red-600 hover:underline"
                        onClick={async () => {
                          await apiC.deleteBoat(b.boat_id);
                          state.reload();
                        }}
                      >
                        Deactivate
                      </button>
                    )}
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
