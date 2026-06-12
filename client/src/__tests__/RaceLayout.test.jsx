import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Real react-router is used here so Outlet / NavLink / deep-linking work.
jest.mock('@clerk/clerk-react', () => ({
  UserButton: () => null,
  useAuth: () => ({ getToken: async () => 'test-token' }),
}));

const mockApi = { getRace: jest.fn() };
jest.mock('../hooks/useApi.js', () => ({ useApi: () => mockApi }));

import { RaceLayout } from '../components/RaceLayout.jsx';

function harness(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/races/new" element={<RaceLayout />}>
          <Route index element={<div>SETUP PAGE</div>} />
        </Route>
        <Route path="/admin/races/:id" element={<RaceLayout />}>
          <Route path="edit" element={<div>SETUP PAGE</div>} />
          <Route path="entries" element={<div>ENTRIES PAGE</div>} />
          <Route path="results" element={<div>RESULTS PAGE</div>} />
          <Route path="startsheet" element={<div>STARTSHEET PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => mockApi.getRace.mockReset());

describe('RaceLayout sub-navigation', () => {
  test('deep-links to a section with the sub-nav present and that tab active', async () => {
    mockApi.getRace.mockResolvedValue({
      name: 'Club Race',
      race_date: '2026-07-01T00:00:00.000Z',
      start_type: 'simultaneous',
      status: 'draft',
    });
    harness('/admin/races/r1/results');

    // The deep-linked page renders inside the layout.
    expect(screen.getByText('RESULTS PAGE')).toBeInTheDocument();
    // Header shows race name + date once loaded.
    expect(await screen.findByText('Club Race · 2026-07-01')).toBeInTheDocument();
    // Results tab is the active one.
    expect(screen.getByRole('link', { name: 'Results' })).toHaveAttribute('aria-current', 'page');
  });

  test('hides the Start Sheet tab for non-pursuit races', async () => {
    mockApi.getRace.mockResolvedValue({ name: 'R', race_date: '2026-07-01', start_type: 'simultaneous', status: 'draft' });
    harness('/admin/races/r1/results');

    // Wait for the race to load so the conditional tab logic has run.
    expect(await screen.findByText('R · 2026-07-01')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Start Sheet' })).not.toBeInTheDocument();
    expect(screen.queryByText('Start Sheet')).not.toBeInTheDocument();
  });

  test('shows the Start Sheet tab for pursuit races', async () => {
    mockApi.getRace.mockResolvedValue({ name: 'P', race_date: '2026-07-01', start_type: 'pursuit', status: 'draft' });
    harness('/admin/races/r1/startsheet');

    expect(await screen.findByRole('link', { name: 'Start Sheet' })).toBeInTheDocument();
    expect(screen.getByText('STARTSHEET PAGE')).toBeInTheDocument();
  });

  test('new/unsaved races disable Entries/Results with a hint; Setup stays available', () => {
    harness('/admin/races/new');

    expect(screen.getByText('SETUP PAGE')).toBeInTheDocument();
    expect(mockApi.getRace).not.toHaveBeenCalled();

    // Setup is a working link; Entries/Results are disabled (not links).
    expect(screen.getByRole('link', { name: 'Setup' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Entries' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Results' })).not.toBeInTheDocument();
    expect(screen.getByText('Entries')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Save the race first/i)).toBeInTheDocument();
  });
});
