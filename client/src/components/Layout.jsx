import { Link } from 'react-router-dom';

/** Public site shell. */
export function Layout({ club, children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-brand-700 text-white no-print">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold">
            {club ? club.name : 'EasyPHRF'}
          </Link>
          <Link to="/admin" className="text-sm text-brand-100 hover:text-white">
            Race Committee
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 py-6 text-center text-xs text-slate-400 no-print">
        Powered by EasyPHRF — easyphrf.com
      </footer>
    </div>
  );
}
