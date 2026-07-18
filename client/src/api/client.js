// Thin fetch wrapper for the EasyPHRF API. Public calls need only the club
// slug; admin calls also pass a Clerk session token (see useApi()).

// Single-tenant: the server resolves one fixed club and ignores this value, but
// it is still sent so the API paths stay valid and Phase-2 multi-tenant restore
// is trivial. Defaults to the Buccaneer Yacht Club slug.
const CLUB_SLUG = import.meta.env.VITE_CLUB_SLUG || 'buccaneer';
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, token, isForm = false } = {}) {
  const headers = { 'X-Club-Slug': CLUB_SLUG };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (isForm) {
    payload = body; // FormData; let the browser set the content type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || res.statusText, data);
  }
  return data;
}

// Public (no auth)
export const api = {
  club: () => request(`/clubs/${CLUB_SLUG}`),
  races: () => request(`/clubs/${CLUB_SLUG}/races`),
  race: (id) => request(`/clubs/${CLUB_SLUG}/races/${id}`),
  racePdfUrl: (id) => `${BASE}/clubs/${CLUB_SLUG}/races/${id}/pdf`,
  seriesList: () => request(`/clubs/${CLUB_SLUG}/series`),
  series: (id) => request(`/clubs/${CLUB_SLUG}/series/${id}`),
  seriesPdfUrl: (id) => `${BASE}/clubs/${CLUB_SLUG}/series/${id}/pdf`,
};

// Admin (token required). Returns an object of methods bound to a token getter.
export function adminApi(getToken) {
  const auth = async (path, opts = {}) => request(path, { ...opts, token: await getToken() });
  return {
    listBoats: () => auth('/admin/boats'),
    createBoat: (body) => auth('/admin/boats', { method: 'POST', body }),
    updateBoat: (id, body) => auth(`/admin/boats/${id}`, { method: 'PUT', body }),
    deleteBoat: (id) => auth(`/admin/boats/${id}`, { method: 'DELETE' }),
    importPdf: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return auth('/admin/boats/import-pdf', { method: 'POST', body: fd, isForm: true });
    },
    confirmImport: (records) => auth('/admin/boats/import-pdf/confirm', { method: 'POST', body: { records } }),

    listRaces: () => auth('/admin/races'),
    getRace: (id) => auth(`/admin/races/${id}`),
    createRace: (body) => auth('/admin/races', { method: 'POST', body }),
    updateRace: (id, body) => auth(`/admin/races/${id}`, { method: 'PUT', body }),
    deleteRace: (id) => auth(`/admin/races/${id}`, { method: 'DELETE' }),
    scoreRace: (id) => auth(`/admin/races/${id}/score`, { method: 'POST' }),
    publishRace: (id) => auth(`/admin/races/${id}/publish`, { method: 'POST' }),
    reviseRace: (id, revision_notes) => auth(`/admin/races/${id}/revise`, { method: 'POST', body: { revision_notes } }),
    startSheet: (id) => auth(`/admin/races/${id}/startsheet`),

    addFleet: (raceId, body) => auth(`/admin/races/${raceId}/fleets`, { method: 'POST', body }),
    updateFleet: (raceId, fid, body) => auth(`/admin/races/${raceId}/fleets/${fid}`, { method: 'PUT', body }),
    deleteFleet: (raceId, fid) => auth(`/admin/races/${raceId}/fleets/${fid}`, { method: 'DELETE' }),

    listEntries: (raceId) => auth(`/admin/races/${raceId}/entries`),
    addEntry: (raceId, body) => auth(`/admin/races/${raceId}/entries`, { method: 'POST', body }),
    updateEntry: (raceId, eid, body) => auth(`/admin/races/${raceId}/entries/${eid}`, { method: 'PUT', body }),
    deleteEntry: (raceId, eid) => auth(`/admin/races/${raceId}/entries/${eid}`, { method: 'DELETE' }),

    listSeries: () => auth('/admin/series'),
    createSeries: (body) => auth('/admin/series', { method: 'POST', body }),
    updateSeries: (id, body) => auth(`/admin/series/${id}`, { method: 'PUT', body }),
    recalculateSeries: (id) => auth(`/admin/series/${id}/recalculate`, { method: 'POST' }),
  };
}
