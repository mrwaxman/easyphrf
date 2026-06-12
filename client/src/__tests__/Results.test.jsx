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
  listEntries: jest.fn().mockResolvedValue([]),
  updateRace: jest.fn(),
  updateEntry: jest.fn(),
  scoreRace: jest.fn(),
};
jest.mock('../hooks/useApi.js', () => ({ useApi: () => mockApi }));

import Results from '../pages/admin/Results.jsx';

const renderResults = () =>
  render(
    <MemoryRouter>
      <Results />
    </MemoryRouter>
  );

beforeEach(() => {
  mockApi.getRace.mockReset();
  mockApi.listEntries.mockResolvedValue([]);
  mockApi.updateRace.mockReset();
  mockApi.scoreRace.mockReset();
});

describe('Results — gun start time', () => {
  const simulRace = {
    race_id: 'race-1',
    name: 'Club Race',
    status: 'draft',
    start_type: 'simultaneous',
    race_date: '2026-07-01T00:00:00.000Z',
    start_time_of_day: '18:00',
  };

  test('defaults the gun time to the scheduled start from setup', async () => {
    mockApi.getRace.mockResolvedValue(simulRace);
    renderResults();

    await screen.findByText('Results — Club Race');
    expect(document.querySelector('input[type="time"]').value).toBe('18:00');
  });

  test('saves the gun time as a time of day with the race date', async () => {
    mockApi.getRace.mockResolvedValue(simulRace);
    mockApi.updateRace.mockResolvedValue({});
    renderResults();

    await screen.findByText('Results — Club Race');
    fireEvent.change(document.querySelector('input[type="time"]'), { target: { value: '18:15' } });
    fireEvent.click(screen.getByRole('button', { name: /Save start time/i }));

    await waitFor(() =>
      expect(mockApi.updateRace).toHaveBeenCalledWith('race-1', {
        start_time_of_day: '18:15',
        race_date: '2026-07-01',
      })
    );
  });

  test('hides the gun-time control for self_timed races', async () => {
    mockApi.getRace.mockResolvedValue({ ...simulRace, start_type: 'self_timed', start_time_of_day: null });
    renderResults();

    await screen.findByText('Results — Club Race');
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });
});

describe('Results — date and time defaults', () => {
  const selfTimedRace = {
    race_id: 'race-1',
    name: 'Club Race',
    status: 'draft',
    start_type: 'self_timed',
    race_date: '2026-07-01T00:00:00.000Z',
    start_time_of_day: null,
  };

  test('finish datetime defaults to race date at noon when no time recorded', async () => {
    mockApi.getRace.mockResolvedValue(selfTimedRace);
    mockApi.listEntries.mockResolvedValue([
      { entry_id: 'e1', boat_name: 'Alpha', sail_number: 'USA 1', finish_status: 'finished',
        finish_time_local: null, self_start_time_local: null },
    ]);
    renderResults();

    await screen.findByText('Results — Club Race');
    const dtInputs = document.querySelectorAll('input[type="datetime-local"]');
    expect(dtInputs.length).toBeGreaterThan(0);
    // Both finish and self-start should default to the race date.
    for (const input of dtInputs) {
      expect(input.value).toMatch(/^2026-07-01/);
    }
  });

  test('gun time defaults to 12:00 (PM) when no start time set', async () => {
    mockApi.getRace.mockResolvedValue({
      race_id: 'race-1', name: 'Club Race', status: 'draft',
      start_type: 'simultaneous', race_date: '2026-07-01T00:00:00.000Z',
      start_time_of_day: null,
    });
    renderResults();

    await screen.findByText('Results — Club Race');
    expect(document.querySelector('input[type="time"]').value).toBe('12:00');
  });
});
