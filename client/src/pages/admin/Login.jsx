import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/client.js';
import { setCredential, clearCredential } from '../../auth.js';

/** Shared-credential race-committee login (Clerk bypassed). */
export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    // Store the credential, then verify it against the server session check.
    setCredential(username, password);
    try {
      await adminApi(() => btoa(`${username}:${password}`)).session();
      navigate('/admin');
    } catch {
      clearCredential();
      setError('Incorrect username or password.');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border border-slate-200 p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-700">
            <img src="/burgee.png" alt="" className="h-11 w-11" />
          </span>
          <h1 className="text-lg font-bold">Race Committee Sign In</h1>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full rounded bg-brand-700 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
