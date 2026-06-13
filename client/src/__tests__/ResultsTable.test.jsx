import { render, screen } from '@testing-library/react';
import { ResultsTable } from '../components/ResultsTable.jsx';

const finisher = (over) => ({
  entry_id: Math.random().toString(36).slice(2),
  boat_name: 'Boat',
  sail_number: 'USA 1',
  skipper_name: 'Skipper',
  rating_used: 90,
  finish_status: 'finished',
  fleet_place: 1,
  elapsed_seconds: 3600,
  corrected_seconds: 3300,
  ...over,
});

describe('ResultsTable', () => {
  test('renders an inferred-rating badge when rating_source is inferred', () => {
    render(<ResultsTable fleet={{ fleet_type: 'phrf', entries: [finisher({ inferred: true })] }} />);
    expect(screen.getByTitle('Inferred rating')).toBeInTheDocument();
  });

  test('does not render an inferred badge for an official rating', () => {
    render(<ResultsTable fleet={{ fleet_type: 'phrf', entries: [finisher({ inferred: false })] }} />);
    expect(screen.queryByTitle('Inferred rating')).not.toBeInTheDocument();
  });

  test('renders an override badge with the note when phrf_override is set', () => {
    render(
      <ResultsTable
        fleet={{
          fleet_type: 'phrf',
          entries: [finisher({ override_applied: true, phrf_override: 120, phrf_override_note: 'measured at dock' })],
        }}
      />
    );
    expect(screen.getByTitle('Override: measured at dock')).toBeInTheDocument();
  });

  test('places non-finishers (DNF) below finishers regardless of input order', () => {
    const entries = [
      finisher({ boat_name: 'Did Not Finish', finish_status: 'dnf', fleet_place: 3, corrected_seconds: null }),
      finisher({ boat_name: 'Winner', fleet_place: 1 }),
      finisher({ boat_name: 'Runner Up', fleet_place: 2 }),
    ];
    render(<ResultsTable fleet={{ fleet_type: 'phrf', entries }} />);
    const order = screen.getAllByTestId('results-row').map((r) => r.getAttribute('data-boat'));
    expect(order).toEqual(['Winner', 'Runner Up', 'Did Not Finish']);
    // The DNF row shows its status label rather than a corrected time.
    expect(screen.getByText('DNF')).toBeInTheDocument();
  });

  test('pursuit fleet omits the Corrected column header and cell', () => {
    render(
      <ResultsTable
        startType="pursuit"
        fleet={{ fleet_type: 'phrf', entries: [finisher({ corrected_seconds: null })] }}
      />
    );
    expect(screen.queryByText('Corrected')).not.toBeInTheDocument();
  });

  test('one-design fleet hides PHRF and corrected columns of meaning', () => {
    render(
      <ResultsTable fleet={{ fleet_type: 'one_design', entries: [finisher({ rating_used: 0 })] }} />
    );
    // PHRF cell shows a dash for one-design.
    const cells = screen.getAllByRole('cell');
    expect(cells.some((c) => c.textContent === '—')).toBe(true);
  });
});
