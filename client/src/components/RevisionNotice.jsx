/** Banner shown on a revised race, surfacing the revision note + timestamp. */
export function RevisionNotice({ revisionNotes, revisedAt }) {
  const when = revisedAt ? String(revisedAt).slice(0, 19).replace('T', ' ') : null;
  return (
    <div
      role="alert"
      className="my-3 rounded border-l-4 border-amber-500 bg-amber-50 p-3 text-amber-900"
    >
      <p className="font-semibold">Results Revised</p>
      {revisionNotes && <p className="mt-1 text-sm">{revisionNotes}</p>}
      {when && <p className="mt-1 text-xs text-amber-700">Revised {when}</p>}
    </div>
  );
}
