/** Render loading / error / data states for a useAsync() result. */
export function AsyncBoundary({ state, children }) {
  if (state.loading) return <p className="py-8 text-center text-slate-400">Loading…</p>;
  if (state.error) {
    return <p className="py-8 text-center text-red-600">Error: {state.error.message}</p>;
  }
  return children(state.data);
}
