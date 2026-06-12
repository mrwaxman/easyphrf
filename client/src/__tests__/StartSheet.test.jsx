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
  startSheet: jest.fn(),
  updateRace: jest.fn(),
};
jest.mock('../hooks/useApi.js', () => ({ useApi: () => mockApi }));

import StartSheet from '../pages/admin/StartSheet.jsx';

const renderSheet = () =>
  render(
    <MemoryRouter>
      <StartSheet />
    </MemoryRouter>
  );

beforeEach(() => {
  mockApi.startSheet.mockReset();
  mockApi.updateRace.mockReset();
});

describe('StartSheet — missing start time is not a dead-end', () => {
  test('renders the inline set-start-time control when start_time is unset', async () => {
    mockApi.startSheet.mockResolvedValue({
      needs_start_time: true,
      race_date: '2026-07-01',
      timezone: 'America/Los_Angeles',
      starts: [],
    });
    renderSheet();

    expect(await screen.findByText('Set the start time')).toBeInTheDocument();
    // No raw "Error:" dead-end.
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
  });

  test('saves the entered time then regenerates the sheet', async () => {
    mockApi.startSheet
      .mockResolvedValueOnce({ needs_start_time: true, race_date: '2026-07-01', timezone: 'UTC', starts: [] })
      .mockResolvedValueOnce({
        timezone: 'UTC',
        starts: [{ boatId: 'b1', boat_name: 'Alpha', sail_number: 'USA 1', phrf: 100, intervalSeconds: 0, startTime: '2026-07-01T18:00:00.000Z' }],
      });
    mockApi.updateRace.mockResolvedValue({});
    renderSheet();

    await screen.findByText('Set the start time');
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & generate/i }));

    await waitFor(() =>
      expect(mockApi.updateRace).toHaveBeenCalledWith('race-1', {
        start_time_of_day: '11:00',
        race_date: '2026-07-01',
      })
    );
    // After reload the generated sheet renders.
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });
});
