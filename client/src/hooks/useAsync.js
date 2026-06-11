import { useCallback, useEffect, useState } from 'react';

/** Run an async function on mount (and on demand via reload). */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(run())
      .then((data) => active && setState({ loading: false, data, error: null }))
      .catch((error) => active && setState({ loading: false, data: null, error }));
    return () => {
      active = false;
    };
  }, [run]);

  useEffect(() => reload(), [reload]);

  return { ...state, reload };
}
