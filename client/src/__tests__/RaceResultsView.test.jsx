import { render, screen } from '@testing-library/react';
import { RaceResultsView } from '../components/RaceResultsView.jsx';

const entry = (over) => ({
  entry_id: Math.random().toString(36).slice(2),
  boat_name: 'Boat',
  sail_number: 'USA 1',
  skipper_name: 'Skipper',
  rating_used: 90,
  finish_status: 'finished',
  fleet_place: 1,
  overall_place: 1,
  elapsed_seconds: 3600,
  corrected_seconds: 3300,
  ...over,
});

const phrfFleet = (id, entries) => ({ fleet_id: id, name: `Fleet ${id}`, fleet_type: 'phrf', entries });

describe('RaceResultsView', () => {
  test('renders the revision notice when status is revised', () => {
    render(
      <RaceResultsView
        race={{
          name: 'Race',
          status: 'revised',
          revision_notes: 'Corrected a finish time',
          revised_at: '2026-06-01T12:00:00Z',
          fleets: [phrfFleet('A', [entry()])],
          has_multiple_phrf_fleets: false,
        }}
      />
    );
    expect(screen.getByText('Results Revised')).toBeInTheDocument();
    expect(screen.getByText('Corrected a finish time')).toBeInTheDocument();
  });

  test('does not render the revision notice for a published race', () => {
    render(
      <RaceResultsView
        race={{ name: 'Race', status: 'published', fleets: [phrfFleet('A', [entry()])], has_multiple_phrf_fleets: false }}
      />
    );
    expect(screen.queryByText('Results Revised')).not.toBeInTheDocument();
  });

  test('shows the overall standings section only when multiple PHRF fleets raced', () => {
    const twoFleets = {
      name: 'Race',
      status: 'published',
      fleets: [phrfFleet('A', [entry({ boat_name: 'Alpha' })]), phrfFleet('B', [entry({ boat_name: 'Bravo' })])],
      overall: [entry({ boat_name: 'Alpha', overall_place: 1 }), entry({ boat_name: 'Bravo', overall_place: 2 })],
      has_multiple_phrf_fleets: true,
    };
    const { rerender } = render(<RaceResultsView race={twoFleets} />);
    expect(screen.getByTestId('overall-standings')).toBeInTheDocument();

    rerender(
      <RaceResultsView
        race={{ name: 'Race', status: 'published', fleets: [phrfFleet('A', [entry()])], overall: [], has_multiple_phrf_fleets: false }}
      />
    );
    expect(screen.queryByTestId('overall-standings')).not.toBeInTheDocument();
  });
});
