import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { adminApi } from '../api/client.js';

/** Admin API bound to the current Clerk session token. */
export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => adminApi(() => getToken()), [getToken]);
}
