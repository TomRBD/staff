export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'X-Requested-With': 'staff-planner' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.message || `Erreur serveur (${res.status})`);
  return data;
}

api.get = (p) => api(p);
api.post = (p, body = {}) => api(p, { method: 'POST', body });
api.put = (p, body) => api(p, { method: 'PUT', body });
api.patch = (p, body) => api(p, { method: 'PATCH', body });
api.del = (p) => api(p, { method: 'DELETE' });
