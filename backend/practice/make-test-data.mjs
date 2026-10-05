/**
 * Creates ONE seeker and ONE employer and has them interact, so every page has
 * something real to render while you check for errors.
 *
 *   cd job-portal && node backend/practice/make-test-data.mjs
 *
 * Nothing here is invented content: the job title, company name and so on are
 * typed in below by you, exactly as if you had entered them in the UI. Delete
 * the accounts with wipe-all-data.mjs --yes when you are finished.
 */
const API = 'http://localhost:5000/api';
const stamp = Date.now();

const seeker = { email: `seeker${stamp}@gmail.com`, password: 'TestPass123' };
const employer = { email: `employer${stamp}@gmail.com`, password: 'TestPass123' };

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}

async function signUp(u, role, fullName) {
  const r = await call('/auth/register', {
    method: 'POST',
    body: { ...u, confirmPassword: u.password, role, fullName },
  });
  const l = await call('/auth/login', { method: 'POST', body: { email: u.email, password: u.password } });
  return { token: l.token, user: r.user };
}

const ok = (m) => console.log(`  ok  ${m}`);

console.log('\nCreating test accounts\n');

const s = await signUp(seeker, 'seeker', 'Test Seeker');
ok(`seeker  ${seeker.email}`);

await call('/profile', {
  method: 'PATCH', token: s.token,
  body: {
    headline: 'Frontend Developer', location: 'Bengaluru', current_role: 'Junior Developer',
    years_experience: 2, skills: ['React', 'CSS'], about: 'Test profile for error checking.',
  },
});
ok('seeker profile filled');

const e = await signUp(employer, 'employer', 'Test Employer');
ok(`employer ${employer.email}`);

// NB: the company router is mounted at /api/companies, and upsert is a POST to
// /companies/company - not PATCH /company. Same for applications: POST
// /applications with jobId + coverLetter (camelCase), not /jobs/:id/apply.
await call('/companies/company', {
  method: 'POST', token: e.token,
  body: { name: 'Test Company', website: 'https://example.com', location: 'Bengaluru' },
});
ok('company profile filled');

const job = await call('/jobs', {
  method: 'POST', token: e.token,
  // type and work_mode must match JOB_TYPES / WORK_MODES in jobService.js
  // exactly ("Full-time", "Remote"), and the field is called `type`, not
  // `job_type`. They are validated against a fixed list, so casing matters.
  body: {
    title: 'Test Frontend Developer', description: 'A job posted to check every page renders.',
    location: 'Bengaluru', type: 'Full-time', work_mode: 'Remote',
    salary_min: 400000, salary_max: 600000, skills: ['React', 'CSS'],
  },
});
ok(`job posted  id=${job.job.id}`);

const app = await call('/applications', {
  method: 'POST', token: s.token,
  body: { jobId: job.job.id, coverLetter: 'Test application.' },
});
ok(`application sent id=${app.application?.id}`);

console.log(`\nSEEKER   ${seeker.email} / ${seeker.password}`);
console.log(`EMPLOYER ${employer.email} / ${employer.password}`);
console.log(`JOB ID   ${job.job.id}\n`);
