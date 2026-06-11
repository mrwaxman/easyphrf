import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';

const links = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/boats', label: 'Boats' },
  { to: '/admin/races', label: 'Races' },
  { to: '/admin/series', label: 'Series' },
];

/** Admin shell with primary navigation and the Clerk user button. */
export function AdminLayout({ children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-brand-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold">EasyPHRF Admin</span>
            <nav className="flex gap-4 text-sm">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    isActive ? 'font-semibold text-white' : 'text-brand-100 hover:text-white'
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
