import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';
import { Layout } from '../../components/Layout.jsx';
import { RaceResultsView } from '../../components/RaceResultsView.jsx';

export default function RaceResults() {
  const { id } = useParams();
  const clubState = useAsync(() => api.club(), []);
  const raceState = useAsync(() => api.race(id), [id]);

  return (
    <Layout club={clubState.data}>
      <div className="mb-4 flex items-center justify-between no-print">
        <Link to="/" className="text-sm text-brand-600 hover:underline">
          ← All races
        </Link>
        <a
          href={api.racePdfUrl(id)}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Download PDF
        </a>
      </div>
      <AsyncBoundary state={raceState}>{(race) => <RaceResultsView race={race} />}</AsyncBoundary>
    </Layout>
  );
}
