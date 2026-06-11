import { FINISH_STATUS_LABELS, RACE_STATUS_LABELS } from '@easyphrf/shared';

/** Amber asterisk marking an inferred PHRF rating. */
export function InferredBadge() {
  return (
    <span title="Inferred rating" className="ml-1 font-bold text-amber-500" aria-label="Inferred rating">
      *
    </span>
  );
}

/** Blue dagger marking a per-race PHRF override; tooltip shows the note. */
export function OverrideBadge({ note }) {
  return (
    <span
      title={note ? `Override: ${note}` : 'PHRF override applied'}
      className="ml-1 font-bold text-blue-600"
      aria-label="PHRF override"
    >
      †
    </span>
  );
}

const RACE_STATUS_STYLES = {
  draft: 'bg-slate-200 text-slate-700',
  open: 'bg-emerald-100 text-emerald-800',
  published: 'bg-brand-100 text-brand-700',
  revised: 'bg-amber-100 text-amber-800',
};

/** Pill showing a race's workflow status. */
export function RaceStatusBadge({ status }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${RACE_STATUS_STYLES[status] || 'bg-slate-200'}`}>
      {RACE_STATUS_LABELS[status] || status}
    </span>
  );
}

/** Label for a non-finisher status (DNF/DNS/DSQ/RAF). */
export function FinishStatusLabel({ status }) {
  return <span className="font-medium text-slate-500">{FINISH_STATUS_LABELS[status] || status}</span>;
}
