import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks -----------------------------------------------------------------
const mockNavigate = jest.fn();
let mockParams = {};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

// AdminLayout pulls in Clerk's UserButton; stub Clerk out for the page tests.
jest.mock('@clerk/clerk-react', () => ({
  UserButton: () => null,
  useAuth: () => ({ getToken: async () => 'test-token' }),
}));

const mockApi = {
  listSeries: jest.fn().mockResolvedValue([]),
  createRace: jest.fn(),
  updateRace: jest.fn(),
  getRace: jest.fn(),
  addFleet: jest.fn(),
  deleteFleet: jest.fn(),
};
jest.mock('../hooks/useApi.js', () => ({ useApi: () => mockApi }));

import RaceSetup from '../pages/admin/RaceSetup.jsx';

const renderSetup = () =>
  render(
    <MemoryRouter>
      <RaceSetup />
    </MemoryRouter>
  );

beforeEach(() => {
  mockNavigate.mockReset();
  mockParams = {}; // new-race route (no :id)
  mockApi.listSeries.mockResolvedValue([]);
  mockApi.createRace.mockReset();
  mockApi.updateRace.mockReset();
});

describe('RaceSetup — Next button', () => {
  test('persists a new race then navigates to its Entries tab', async () => {
    mockApi.createRace.mockResolvedValue({ race_id: 'race-1' });
    renderSetup();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Club Race' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Entries/i }));

    await waitFor(() => expect(mockApi.createRace).toHaveBeenCalledTimes(1));
    expect(mockApi.createRace).toHaveBeenCalledWith(expect.objectContaining({ name: 'Club Race' }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/races/race-1/entries');
  });

  test('surfaces a save error and does not navigate on failure', async () => {
    mockApi.createRace.mockRejectedValue(new Error('Save failed'));
    renderSetup();

    fireEvent.click(screen.getByRole('button', { name: /Next: Entries/i }));

    await screen.findByText('Save failed');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('disables both buttons while a save is in flight (guards double-submit)', async () => {
    let resolveCreate;
    mockApi.createRace.mockReturnValue(new Promise((res) => { resolveCreate = res; }));
    renderSetup();

    fireEvent.click(screen.getByRole('button', { name: /Next: Entries/i }));

    // Both buttons flip to a disabled "Saving…" state, blocking a double-submit.
    await waitFor(() => {
      const saving = screen.getAllByRole('button', { name: /Saving/i });
      expect(saving).toHaveLength(2);
      saving.forEach((btn) => expect(btn).toBeDisabled());
    });

    resolveCreate({ race_id: 'race-2' });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/races/race-2/entries'));
  });

  test('Save as Draft still creates and routes to the edit screen', async () => {
    mockApi.createRace.mockResolvedValue({ race_id: 'race-3' });
    renderSetup();

    fireEvent.click(screen.getByRole('button', { name: /Save as Draft/i }));

    await waitFor(() => expect(mockApi.createRace).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/races/race-3/edit');
  });
});

describe('RaceSetup — scheduled start time', () => {
  const timeInput = (container) => container.querySelector('input[type="time"]');

  test('shows the start-time field for simultaneous and saves it as time of day', async () => {
    mockApi.createRace.mockResolvedValue({ race_id: 'race-1' });
    const { container } = renderSetup();

    fireEvent.change(timeInput(container), { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Entries/i }));

    await waitFor(() => expect(mockApi.createRace).toHaveBeenCalledTimes(1));
    expect(mockApi.createRace).toHaveBeenCalledWith(
      expect.objectContaining({ start_time_of_day: '14:30', start_type: 'simultaneous' })
    );
  });

  test('marks the field required and explains it for pursuit races', () => {
    const { container } = renderSetup();
    fireEvent.change(screen.getByLabelText('Start type'), { target: { value: 'pursuit' } });

    expect(timeInput(container)).toBeRequired();
    expect(screen.getByText(/base time pursuit offsets are computed from/i)).toBeInTheDocument();
  });

  test('hides the start-time field for self_timed and sends null', async () => {
    mockApi.createRace.mockResolvedValue({ race_id: 'race-2' });
    const { container } = renderSetup();

    fireEvent.change(screen.getByLabelText('Start type'), { target: { value: 'self_timed' } });
    expect(timeInput(container)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Next: Entries/i }));
    await waitFor(() => expect(mockApi.createRace).toHaveBeenCalledTimes(1));
    expect(mockApi.createRace).toHaveBeenCalledWith(
      expect.objectContaining({ start_type: 'self_timed', start_time_of_day: null })
    );
  });
});
