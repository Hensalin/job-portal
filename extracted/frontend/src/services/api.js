const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const getToken = () => localStorage.getItem('token');
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};
export const saveSession = (token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};
export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export const api = {
  register: (b) => request('/auth/register', { method: 'POST', body: b }),
  login: (b) => request('/auth/login', { method: 'POST', body: b }),

  getJobs: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/jobs${q ? `?${q}` : ''}`);
  },
  getMyJobs: () => request('/jobs/mine/list'),
  createJob: (b) => request('/jobs', { method: 'POST', body: b }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),

  apply: (jobId, coverLetter) =>
    request('/applications', { method: 'POST', body: { jobId, coverLetter } }),
  getMyApplications: () => request('/applications/mine'),
  getJobApplications: (jobId) => request(`/applications/job/${jobId}`),
  setApplicationStatus: (id, status) =>
    request(`/applications/${id}/status`, { method: 'PATCH', body: { status } }),
};
