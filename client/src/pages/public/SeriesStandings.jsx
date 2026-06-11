import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AsyncBoundary } from '../../components/AsyncBoundary.jsx';
import { Layout } from '../../components/Layout.jsx';
import { StandingsTable } from '../../components/StandingsTable.jsx';

export default function SeriesStandings() {
  const { id } = useParams();
  const clubState = useAsync(() => api.club(), []);
  const seriesState = useAsync(() => api.series(id), [id]);

  return (
    <Layout club={clubState.data}>
      <div className="mb-4 flex items-center justify-between no-print">
        <Link to="/" className="text-sm text-brand-600 hover:underline">
          ← Home
        </Link>
        <a
          href={api.seriesPdfUrl(id)}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Download PDF
        </a>
      </div>
      <AsyncBoundary state={seriesState}>
        {(data) => (
          <div>
            <h1 className="text-2xl font-bold text-brand-700">{data.series.name}</h1>
            <p className="mb-4 text-sm text-slate-500">Season {data.series.season_year}</p>
            {data.standings.length === 0 ? (
              <p className="text-slate-500">No scored races in this series yet.</p>
            ) : (
              <StandingsTable races={data.races} standings={data.standings} />
            )}
          </div>
        )}
      </AsyncBoundary>
    </Layout>
  );
}
