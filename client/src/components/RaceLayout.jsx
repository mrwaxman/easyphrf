import { useParams, NavLink, Outlet } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { useAsync } from '../hooks/useAsync.js';
import { AdminLayout } from './AdminLayout.jsx';

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '');

/**
 * Shared shell for every race-scoped admin page (/admin/races/:id/*, plus the
 * /admin/races/new create screen). Renders a small race header and a sub-nav of
 * Setup / Entries / Results / Start Sheet once, then the active page via
 * <Outlet/>. Deep links work because the layout matches the parent route.
 *
 * Rules:
 *  - Setup is always available.
 *  - Entries / Results / Start Sheet need a saved race_id; until the race is
 *    saved once they are shown disabled with a "Save the race first." hint.
 *  - Start Sheet only applies to pursuit races; it is hidden otherwise.
 */
export function RaceLayout() {
  const { id } = useParams();
  const saved = !!id;
  const apiC = useApi();
  const raceState = useAsync(() => (saved ? apiC.getRace(id) : Promise.resolve(null)), [id, saved]);
  const race = raceState.data;

  const base = saved ? `/admin/races/${id}` : '/admin/races/new';
  const isPursuit = race?.start_type === 'pursuit';

  const tabs = [
    { key: 'setup', label: 'Setup', to: saved ? `${base}/edit` : base, enabled: true, show: true },
    { key: 'entries', label: 'Entries', to: `${base}/entries`, enabled: saved, show: true },
    { key: 'results', label: 'Results', to: `${base}/results`, enabled: saved, show: true },
    // Start Sheet applies to pursuit only; once saved it appears, enabled.
    { key: 'startsheet', label: 'Start Sheet', to: `${base}/startsheet`, enabled: saved, show: isPursuit },
  ];

  const tabClass = ({ isActive }) =>
    `-mb-px whitespace-nowrap rounded-t border-b-2 px-3 py-1.5 text-sm ${
      isActive
        ? 'border-brand-600 font-semibold text-brand-700'
        : 'border-transparent text-slate-500 hover:text-slate-800'
    }`;

  const headerText = saved
    ? race
      ? `${race.name || 'Untitled race'}${race.race_date ? ` · ${fmtDate(race.race_date)}` : ''}`
      : 'Loading…'
    : 'New race';

  return (
    <AdminLayout>
      <div className="mb-4">
        <div className="text-sm font-medium text-slate-600">{headerText}</div>
        <nav className="mt-2 flex flex-wrap gap-1 overflow-x-auto border-b">
          {tabs
            .filter((t) => t.show)
            .map((t) =>
              t.enabled ? (
                <NavLink key={t.key} to={t.to} end className={tabClass}>
                  {t.label}
                </NavLink>
              ) : (
                <span
                  key={t.key}
                  title="Save the race first."
                  aria-disabled="true"
                  className="-mb-px cursor-not-allowed whitespace-nowrap rounded-t border-b-2 border-transparent px-3 py-1.5 text-sm text-slate-300"
                >
                  {t.label}
                </span>
              )
            )}
        </nav>
        {!saved && (
          <p className="mt-1 text-xs text-slate-400">Save the race first to add entries, results, or a start sheet.</p>
        )}
      </div>
      <Outlet />
    </AdminLayout>
  );
}
