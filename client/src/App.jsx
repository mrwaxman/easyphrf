import { Routes, Route } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn, SignIn } from '@clerk/clerk-react';

import Home from './pages/public/Home.jsx';
import RaceResults from './pages/public/RaceResults.jsx';
import SeriesStandings from './pages/public/SeriesStandings.jsx';

import Dashboard from './pages/admin/Dashboard.jsx';
import Boats from './pages/admin/Boats.jsx';
import RacesList from './pages/admin/RacesList.jsx';
import RaceSetup from './pages/admin/RaceSetup.jsx';
import Entries from './pages/admin/Entries.jsx';
import Results from './pages/admin/Results.jsx';
import StartSheet from './pages/admin/StartSheet.jsx';
import Series from './pages/admin/Series.jsx';
import { RaceLayout } from './components/RaceLayout.jsx';

/** Gate admin routes behind a Clerk session. */
function RequireAdmin({ children }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Home />} />
      <Route path="/races/:id" element={<RaceResults />} />
      <Route path="/series/:id" element={<SeriesStandings />} />

      {/* Clerk-hosted sign in */}
      <Route
        path="/sign-in/*"
        element={
          <div className="flex min-h-screen items-center justify-center">
            <SignIn routing="path" path="/sign-in" />
          </div>
        }
      />

      {/* Admin (auth required) */}
      <Route path="/admin" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
      <Route path="/admin/boats" element={<RequireAdmin><Boats /></RequireAdmin>} />
      <Route path="/admin/races" element={<RequireAdmin><RacesList /></RequireAdmin>} />
      {/* New race: shares the race sub-nav (Setup only until first save). */}
      <Route path="/admin/races/new" element={<RequireAdmin><RaceLayout /></RequireAdmin>}>
        <Route index element={<RaceSetup />} />
      </Route>
      {/* Existing race: sub-nav wraps every section so it is defined once. */}
      <Route path="/admin/races/:id" element={<RequireAdmin><RaceLayout /></RequireAdmin>}>
        <Route path="edit" element={<RaceSetup />} />
        <Route path="entries" element={<Entries />} />
        <Route path="results" element={<Results />} />
        <Route path="startsheet" element={<StartSheet />} />
      </Route>
      <Route path="/admin/series" element={<RequireAdmin><Series /></RequireAdmin>} />

      <Route path="*" element={<div className="p-8 text-center text-slate-500">Not found</div>} />
    </Routes>
  );
}
