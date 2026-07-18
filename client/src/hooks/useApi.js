import { useMemo } from 'react';
import { adminApi } from '../api/client.js';
import { getCredential } from '../auth.js';

/** Admin API bound to the stored shared credential (Clerk bypassed). */
export function useApi() {
  return useMemo(() => adminApi(() => getCredential()), []);
}
