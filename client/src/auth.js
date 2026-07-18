// HACK: shared-credential admin auth (Clerk bypassed). The base64 of
// "username:password" is kept in localStorage and sent as an HTTP Basic header
// on admin API calls; the server validates it against ADMIN_USERNAME/PASSWORD.
// Low security by design — restore Clerk for real auth.

const KEY = 'phrf_admin_credential';

export function setCredential(username, password) {
  localStorage.setItem(KEY, btoa(`${username}:${password}`));
}

export function getCredential() {
  return localStorage.getItem(KEY) || '';
}

export function clearCredential() {
  localStorage.removeItem(KEY);
}

export function isAuthed() {
  return !!getCredential();
}
