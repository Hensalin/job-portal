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

/**
 * Error object that always carries:
 *   message  - safe to show the user
 *   code     - machine readable, so the UI can react (e.g. UNAUTHORIZED -> logout)
 *   status   - HTTP status
 *   details  - { field: "message" } so forms can highlight the exact input
 */
export class ApiRequestError extends Error {
  constructor(message, { code = 'UNKNOWN', status = 0, details = null } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Called by AuthProvider so any 401 anywhere logs the user out cleanly. */
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(path, { method = 'GET', body, formData, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // Do NOT set Content-Type when sending FormData: the browser must add the
  // multipart boundary itself or the server cannot parse the file.
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // fetch() only throws when NO response arrived: server down, wrong port,
    // or the browser blocked it (CORS). Log the detail, show a human message.
    console.error(`[api] ${method} ${BASE}${path} - no response`, err);
    throw new ApiRequestError(
      'Cannot reach the server. Make sure the backend is running on port 5000.',
      { code: 'NETWORK_ERROR', status: 0 }
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiRequestError(data.error || `Request failed (${res.status}).`, {
      code: data.code || 'ERROR',
      status: res.status,
      details: data.details || null,
    });
  }
  return data;
}

const qs = (params = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // ---------------------------------------------------------------- auth
  register: (b) => request('/auth/register', { method: 'POST', body: b }),
  login: (b) => request('/auth/login', { method: 'POST', body: b }),
  resendVerification: (email) => request('/auth/resend-verification', { method: 'POST', body: { email } }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // ---------------------------------------------------------------- jobs
  getJobs: (params = {}, opts = {}) => request(`/jobs${qs(params)}`, opts),
  getJobOptions: () => request('/jobs/options'),
  getJob: (id) => request(`/jobs/${id}`),
  getSimilarJobs: (id) => request(`/jobs/${id}/similar`),
  getJobQuestions: (id) => request(`/jobs/${id}/questions`),
  getRecommendedJobs: () => request('/jobs/recommended'),
  getSavedJobs: () => request('/jobs/saved'),
  saveJob: (id) => request(`/jobs/${id}/save`, { method: 'POST' }),
  unsaveJob: (id) => request(`/jobs/${id}/save`, { method: 'DELETE' }),
  reportJob: (id, b) => request(`/jobs/${id}/report`, { method: 'POST', body: b }),

  getMyJobs: (status) => request(`/jobs/mine/list${qs({ status })}`),
  createJob: (b) => request('/jobs', { method: 'POST', body: b }),
  updateJob: (id, b) => request(`/jobs/${id}`, { method: 'PATCH', body: b }),
  setJobStatus: (id, status) => request(`/jobs/${id}/status`, { method: 'PATCH', body: { status } }),
  duplicateJob: (id) => request(`/jobs/${id}/duplicate`, { method: 'POST' }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),

  // ---------------------------------------------------------------- applications
  apply: (b) => request('/applications', { method: 'POST', body: b }),
  getMyApplications: (params = {}) => {
    // Accepts either a plain status string or a full query object.
    const q = typeof params === 'string' ? { status: params } : params;
    return request(`/applications/mine${qs(q)}`);
  },
  /**
   * Returns the application record, NOT the raw response.
   *
   * GET /applications/:id replies { application, pipeline }. Every caller wants
   * the application itself, so unwrap it here rather than in each component.
   * Both Applicants.jsx and MyApplications.jsx used to assign the whole
   * envelope into state, so `detail.applicant` was undefined and every field on
   * the detail panel rendered a bare "—" - the employer saw a candidate with no
   * name, no headline and no experience even though the API had sent it all.
   */
  getApplication: async (id) => (await request(`/applications/${id}`)).application,
  withdrawApplication: (id) => request(`/applications/${id}/withdraw`, { method: 'POST' }),
  setApplicationStatus: (id, status) => request(`/applications/${id}/status`, { method: 'PATCH', body: { status } }),
  getJobApplications: (jobId, params = {}) => request(`/applications/job/${jobId}${qs(params)}`),
  getNotes: (id) => request(`/applications/${id}/notes`),
  addNote: (id, note) => request(`/applications/${id}/notes`, { method: 'POST', body: { note } }),
  scheduleInterview: (id, b) => request(`/applications/${id}/interviews`, { method: 'POST', body: b }),
  cancelInterview: (id, interviewId) => request(`/applications/${id}/interviews/${interviewId}`, { method: 'DELETE' }),
  getResumeDownloadUrl: (id) => request(`/applications/${id}/resume`),

  // ---------------------------------------------------------------- profile
  getProfile: () => request('/profile'),
  updateProfile: (b) => request('/profile', { method: 'PATCH', body: b }),
  getPublicProfile: (id) => request(`/profile/${id}`),

  listSection: (kind) => request(`/profile/sections/${kind}`),
  addSection: (kind, b) => request(`/profile/sections/${kind}`, { method: 'POST', body: b }),
  updateSection: (kind, id, b) => request(`/profile/sections/${kind}/${id}`, { method: 'PATCH', body: b }),
  deleteSection: (kind, id) => request(`/profile/sections/${kind}/${id}`, { method: 'DELETE' }),

  // ---------------------------------------------------------------- company
  getMyCompany: () => request('/companies/mine/company'),
  saveCompany: (b) => request('/companies/company', { method: 'POST', body: b }),
  getCompany: (id) => request(`/companies/${id}`),

  // ---------------------------------------------------------------- resumes
  getResumes: () => request('/resumes'),
  uploadResume: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/resumes', { method: 'POST', formData: fd });
  },
  deleteResume: (id) => request(`/resumes/${id}`, { method: 'DELETE' }),
  setDefaultResume: (id) => request(`/resumes/${id}/default`, { method: 'PATCH' }),

  // ---------------------------------------------------------------- notifications
  getNotifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),

  // ---------------------------------------------------------------- alerts
  getAlerts: () => request('/admin/alerts'),
  createAlert: (b) => request('/admin/alerts', { method: 'POST', body: b }),
  updateAlert: (id, b) => request(`/admin/alerts/${id}`, { method: 'PATCH', body: b }),
  deleteAlert: (id) => request(`/admin/alerts/${id}`, { method: 'DELETE' }),
  runAlert: (id) => request(`/admin/alerts/${id}/run`, { method: 'POST' }),

  // ---------------------------------------------------------------- admin
  getStats: () => request('/admin/stats'),
  getUsers: (params = {}) => request(`/admin/users${qs(params)}`),
  setUserActive: (id, isActive) => request(`/admin/users/${id}`, { method: 'PATCH', body: { isActive } }),
  getAllJobs: (params = {}) => request(`/admin/jobs${qs(params)}`),
  adminDeleteJob: (id) => request(`/admin/jobs/${id}`, { method: 'DELETE' }),
  getCompanies: (params = {}) => request(`/admin/companies${qs(params)}`),
  setCompanyStatus: (id, status) => request(`/admin/companies/${id}`, { method: 'PATCH', body: { status } }),
  getReports: (status = 'open') => request(`/admin/reports${qs({ status })}`),
  resolveReport: (id, status) => request(`/admin/reports/${id}`, { method: 'PATCH', body: { status } }),
};
