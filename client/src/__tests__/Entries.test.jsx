import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 'race-1' }),
}));

jest.mock('@clerk/clerk-react', () => ({
  UserButton: () => null,
  useAuth: () => ({ getToken: async () => 'test-token' }),
}));

const mockApi = {
  getRace: jest.fn(),
  listBoats: jest.fn().mockResolvedValue([]),
  listEntries: jest.fn().mockResolvedValue([]),
  addFleet: jest.fn(),
  addEntry: jest.fn(),
  deleteEntry: jest.fn(),
};
jest.mock('../hooks/useApi.js', () => ({ useApi: () => mockApi }));

import Entries from '../pages/admin/Entries.jsx';

const raceWith = (fleets) => ({ race_id: 'race-1', name: 'Club Race', fleets });

const renderEntries = () =>
  render(
    <MemoryRouter>
      <Entries />
    </MemoryRouter>
  );

beforeEach(() => {
  mockApi.getRace.mockReset();
  mockApi.listBoats.mockResolvedValue([]);
  mockApi.listEntries.mockResolvedValue([]);
  mockApi.addFleet.mockReset();
});

describe('Entries — single-fleet UX', () => {
  test('fleet selector is hidden and FLEET column is hidden for a single-fleet race', async () => {
    mockApi.getRace.mockResolvedValue(raceWith([{ fleet_id: 'f1', name: 'Fleet' }]));
    renderEntries();

    await screen.findByText('Entries — Club Race');
    expect(screen.queryByText('Select fleet…')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /fleet/i })).not.toBeInTheDocument();
  });

  test('fleet selector and FLEET column are shown for a multi-fleet race', async () => {
    mockApi.getRace.mockResolvedValue(
      raceWith([{ fleet_id: 'f1', name: 'A' }, { fleet_id: 'f2', name: 'B' }])
    );
    renderEntries();

    await screen.findByText('Entries — Club Race');
    expect(screen.getByText('Select fleet…')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /fleet/i })).toBeInTheDocument();
  });

  test('adding an entry in a single-fleet race uses the only fleet automatically', async () => {
    mockApi.getRace.mockResolvedValue(raceWith([{ fleet_id: 'f1', name: 'Fleet' }]));
    mockApi.listBoats.mockResolvedValue([{ boat_id: 'b1', sail_number: 'USA 1', boat_name: 'Boat', active: true }]);
    mockApi.addEntry.mockResolvedValue({});
    renderEntries();

    await screen.findByText('Entries — Club Race');
    fireEvent.change(screen.getByRole('combobox', { name: '' }), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: /Add entry/i }));

    await waitFor(() =>
      expect(mockApi.addEntry).toHaveBeenCalledWith(
        'race-1',
        expect.objectContaining({ boat_id: 'b1', fleet_id: 'f1' })
      )
    );
  });
});

describe('Entries — add-a-fleet affordance', () => {
  test('shows the split explanation when the race has exactly one fleet', async () => {
    mockApi.getRace.mockResolvedValue(raceWith([{ fleet_id: 'f1', name: 'Fleet' }]));
    renderEntries();

    await screen.findByText('Entries — Club Race');
    expect(screen.getByRole('button', { name: /\+ Add a fleet/i })).toBeInTheDocument();
    expect(screen.getByText(/Split boats across fleets/i)).toBeInTheDocument();
  });

  test('hides the split explanation when more than one fleet already exists', async () => {
    mockApi.getRace.mockResolvedValue(
      raceWith([{ fleet_id: 'f1', name: 'A' }, { fleet_id: 'f2', name: 'B' }])
    );
    renderEntries();

    await screen.findByText('Entries — Club Race');
    // The "+ Add a fleet" affordance is still reachable, but the one-fleet hint is gone.
    expect(screen.getByRole('button', { name: /\+ Add a fleet/i })).toBeInTheDocument();
    expect(screen.queryByText(/Split boats across fleets/i)).not.toBeInTheDocument();
  });

  test('reveals the form and creates a fleet via the API, then reloads', async () => {
    mockApi.getRace.mockResolvedValue(raceWith([{ fleet_id: 'f1', name: 'Fleet' }]));
    mockApi.addFleet.mockResolvedValue({ fleet_id: 'f2', name: 'PHRF A' });
    renderEntries();

    await screen.findByText('Entries — Club Race');
    fireEvent.click(screen.getByRole('button', { name: /\+ Add a fleet/i }));

    fireEvent.change(screen.getByPlaceholderText('Fleet name'), { target: { value: 'PHRF A' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add fleet$/i }));

    await waitFor(() => expect(mockApi.addFleet).toHaveBeenCalledTimes(1));
    expect(mockApi.addFleet).toHaveBeenCalledWith(
      'race-1',
      expect.objectContaining({ name: 'PHRF A', fleet_type: 'phrf', phrf_min: null, phrf_max: null })
    );
    // getRace is called once on mount and again on the post-add reload.
    await waitFor(() => expect(mockApi.getRace).toHaveBeenCalledTimes(2));
  });
});
