/**
 * Seeds the database with realistic demo data.
 *
 *   cd backend && node practice/seed-demo.mjs
 *
 * RUN THIS AFTER APPLYING database/migrations/001_advanced.sql - it fills the
 * new tables (companies, job_skills, notifications, saved_jobs) as well.
 *
 * SAFE TO RE-RUN: every step checks whether the thing already exists first.
 * It talks to the running API on port 5000, so start the backend first:
 *      cd backend && npm run dev
 *
 * REBUILDING THE JOBS: the "skip if jobs exist" guard is what makes this safe
 * to re-run, but it also means that if you EDIT the JOBS array below, running
 * the seed again will not pick up your change - the old jobs are still there
 * and it prints "employer already has N job(s)". That is the single most
 * confusing thing about this file, so there is an escape hatch:
 *      node practice/seed-demo.mjs --force
 * deletes the demo employer's jobs and applications first, then re-inserts.
 * It only ever touches jobs owned by the demo employer.
 *
 * NOTE ON THE PASSWORD: it must satisfy the strong-password rules (8+ chars,
 * upper, lower, digit) because POST /auth/register enforces them. If you forget
 * a demo password, run:  node practice/reset-demo-users.mjs
 *
 * ---------------------------------------------------------------------------
 * THIS SCRIPT IS OPT-IN AND IDLE BY DEFAULT.
 * The database is meant to hold only data you entered yourself, so running this
 * with no flag prints a notice and exits without writing anything:
 *      node practice/seed-demo.mjs            <- notice only, changes nothing
 *      node practice/seed-demo.mjs --demo     <- load the fake data
 * To return to an empty database:  node practice/wipe-all-data.mjs --yes
 * ---------------------------------------------------------------------------
 */
const BASE = process.env.API || 'http://localhost:5000/api';
const PASSWORD = 'Demo1234';

// --force rebuilds jobs instead of skipping them. See the note above.
const FORCE = process.argv.includes('--force');

// --demo is the opt-in switch. Nothing happens without it.
// --force only means something once --demo is also present, so requiring
// "--force" on its own must not be a back door into writing fake data.
const DEMO = process.argv.includes('--demo');
if (!DEMO) {
  console.log(`
  Demo data is OFF by default.

  This script only invents companies, jobs and candidates so you can click
  around without typing anything in. Your database is meant to hold just the
  data you entered, so nothing has been written.
${FORCE ? '\n  --force was ignored: it only rebuilds jobs, it never enables seeding.\n' : ''}
  To load the fake demo data:
      node practice/seed-demo.mjs --demo

  To empty the database completely:
      node practice/wipe-all-data.mjs --yes
`);
  process.exit(0);
}

const forceTag = (m) => (FORCE ? m : skip(m));

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(BASE + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (e) {
    console.error(`\n  Cannot reach ${BASE}.`);
    console.error('  Start the backend first:  cd backend && npm run dev\n');
    process.exit(1);
  }
}

/** Like call(), but for multipart bodies (resume upload). `call` only JSON-encodes. */
async function callRaw(path, { method = 'GET', body, form, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // Deliberately NO Content-Type: fetch sets it with the multipart boundary.
  try {
    const res = await fetch(BASE + path, {
      method, headers, body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (e) {
    console.error(`\n  Cannot reach ${BASE}.`);
    console.error('  Start the backend first:  cd backend && npm run dev\n');
    process.exit(1);
  }
}

const ok = (m) => console.log(`  ${m}`);
const skip = (m) => console.log(`  = ${m} (already exists)`);

// ---------------------------------------------------------------- accounts
const EMPLOYER = {
  email: 'hr@acmetech.com', password: PASSWORD, confirmPassword: PASSWORD,
  fullName: 'Ravi Menon', role: 'employer', phone: '9876543210',
};
const SEEKER = {
  email: 'neha@mail.com', password: PASSWORD, confirmPassword: PASSWORD,
  fullName: 'Neha Sharma', role: 'seeker', phone: '9812345678',
};
const SEEKER2 = {
  email: 'imran@mail.com', password: PASSWORD, confirmPassword: PASSWORD,
  fullName: 'Imran Khan', role: 'seeker', phone: '9712345678',
};

async function ensureUser(u) {
  // Try LOGIN first, register only if that fails. The other way round means
  // every re-run fires three registrations at the rate limiter, and after a
  // few runs you get "429 Too many attempts" instead of the data you wanted.
  let token = null;
  const login = await call('/auth/login', { method: 'POST', body: { email: u.email, password: u.password } });

  if (login.status === 200) {
    skip(`${u.role}: ${u.email}`);
    token = login.data.token;
  } else {
    const reg = await call('/auth/register', { method: 'POST', body: u });
    if (reg.status === 201) ok(`created ${u.role}: ${u.email}`);
    else if (reg.status === 409) skip(`${u.role}: ${u.email}`);
    else console.log(`  ! register ${u.email} -> ${reg.status} ${reg.data.error || ''}`);

    // Login proves the account is usable. If it fails, tell the user exactly why.
    const retry = await call('/auth/login', { method: 'POST', body: { email: u.email, password: u.password } });
    if (retry.status !== 200) {
      console.log(`\n  Cannot log in as ${u.email}: ${retry.data.error}`);
      if (/confirm|verify/i.test(retry.data.error || '')) {
        console.log('  This is CORRECT behaviour - unverified email cannot log in.');
        console.log('  Fix it: Supabase dashboard -> Authentication -> Users -> tick "Email Confirmed"');
        console.log('          or enable email confirmation off in Authentication -> Providers.\n');
      }
      process.exit(1);
    }
    token = retry.data.token;
  }

  return token;
}

// ---------------------------------------------------------------- content
const COMPANY = {
  name: 'Acme Tech Solutions', industry: 'Software / SaaS', size: '51-200',
  founded_year: 2016, location: 'Bengaluru, Karnataka', website: 'https://acmetech.example.com',
  email: 'careers@acmetech.example.com', phone: '8045678901',
  about: 'Acme Tech builds hiring software used by over 400 companies across India. '
       + 'Our engineering team is small, senior, and owns problems end to end.',
  culture: 'We write a lot, we review kindly, and we protect focus time. No standup marathons.',
  benefits: ['Remote friendly', 'Health insurance', 'Learning budget', 'Flexible hours'],
};

const JOBS = [
  {
    title: 'React Developer', company: 'Acme Tech Solutions',
    type: 'Full-time', work_mode: 'Hybrid', experience_level: '1-3 years',
    city: 'Bengaluru', state: 'Karnataka', country: 'India', openings: 2,
    salary_min: 900000, salary_max: 1400000, salary_period: 'Per year',
    department: 'Engineering',
    description: 'We are looking for a React Developer to build the interfaces our customers use every day. '
      + 'You will work on reusable component libraries, complex forms, and data-heavy dashboards. '
      + 'Our frontend is React 18 with Vite, and we care a lot about accessibility and fast first loads.',
    overview: 'Own the customer-facing product surface from component design through to production.',
    responsibilities: 'Build and maintain reusable React components used across the whole product.\n'
      + 'Turn complex workflows into simple, accessible interfaces.\n'
      + 'Work with the design team to keep our component library consistent.\n'
      + 'Improve page load performance and bundle size.',
    required_skills: ['React', 'JavaScript', 'CSS', 'HTML'],
    preferred_skills: ['TypeScript', 'Redux', 'Vite'],
    qualifications: 'Bachelor in Computer Science or equivalent practical experience.',
    experience_required: 'At least 1 year of professional React work.',
    education_req: 'B.Tech / B.E. / BCA or equivalent',
    benefits: 'Health insurance for you and your family, and a yearly learning budget.',
    work_environment: 'Hybrid - 2 days a week in the Bengaluru office, the rest from wherever you work best.',
    questions: [
      { question: 'Are you comfortable working 2 days a week from the Bengaluru office?', type: 'boolean', is_required: true },
      { question: 'Link to a GitHub repository or project you are proud of', type: 'text', is_required: false },
      { question: 'What is the notice period on your current role?', type: 'text', is_required: true },
    ],
  },
  {
    title: 'Node.js Backend Intern', company: 'Startup Labs', type: 'Internship', work_mode: 'Remote', experience_level: 'Fresher',
    city: 'Remote', country: 'India', openings: 3,
    salary_min: 20000, salary_max: 30000, salary_period: 'Per month',
    department: 'Engineering',
    description: 'A six month paid internship on our backend team. You will work on real production APIs '
      + 'alongside experienced engineers, with code review on everything you write. Great fit if you want '
      + 'to learn Express, PostgreSQL and how a real product is shipped.',
    overview: 'Learn on a real codebase, not a side project.',
    responsibilities: 'Build and test REST API endpoints with Node and Express.\n'
      + 'Write and run database migrations.\n'
      + 'Fix bugs and add tests for issues you find.',
    required_skills: ['JavaScript', 'Node.js', 'SQL'],
    preferred_skills: ['Git'],
    qualifications: 'Currently pursuing a degree, or recently finished one.',
    experience_required: 'No professional experience needed.',
    education_req: 'Final year students or recent graduates',
    benefits: 'Paid internship, a dedicated mentor, and a real chance at a full-time offer.',
  },
  {
    title: 'QA Engineer', company: 'Quality First', type: 'Contract', work_mode: 'On-site', experience_level: '1-3 years',
    city: 'Pune', state: 'Maharashtra', country: 'India', openings: 1,
    salary_min: 600000, salary_max: 900000, salary_period: 'Per year',
    department: 'Quality',
    description: 'Write and run test plans for our web application. You will work directly with the '
      + 'engineering team, reproduce bugs precisely, and help us decide what to automate and what does not '
      + 'need a human.',
    overview: 'Be the reason our releases are boring.',
    responsibilities: 'Write manual and automated test cases.\n'
      + 'Reproduce and document bugs with clear steps.\n'
      + 'Run regression suites before every release.',
    required_skills: ['Manual Testing', 'Postman', 'SQL'],
    preferred_skills: ['Selenium', 'Jest'],
    qualifications: 'B.Tech / BCA or equivalent.',
    experience_required: '1+ year in manual or automated testing.',
    education_req: 'Any graduate degree',
  },
  {
    title: 'Product Designer', company: 'Acme Tech Solutions', type: 'Full-time', work_mode: 'Hybrid', experience_level: '3-5 years',
    city: 'Bengaluru', state: 'Karnataka', country: 'India', openings: 1,
    salary_min: 1400000, salary_max: 2000000, salary_period: 'Per year',
    department: 'Design',
    description: 'Own the end to end design of our employer dashboard. You will interview customers, '
      + 'prototype, design, and then sit with engineers until it ships. We want someone who is comfortable '
      + 'with the full loop rather than only handing over mockups.',
    overview: 'Design the product our customers run their hiring on.',
    responsibilities: 'Run discovery calls with hiring managers.\n'
      + 'Design flows and wireframes in Figma.\n'
      + 'Maintain and extend our design system.\n'
      + 'Review shipped work with engineering.',
    required_skills: ['Figma', 'Prototyping', 'Design Systems'],
    preferred_skills: ['User Research', 'HTML', 'CSS'],
    qualifications: 'A portfolio that shows shipped product work.',
    experience_required: '3+ years in product design.',
    education_req: 'Any degree, or a strong portfolio',
  },
  {
    title: 'Customer Support Associate', company: 'Helpdesk Co', type: 'Part-time', work_mode: 'Remote', experience_level: 'Fresher',
    city: 'Remote', country: 'India', openings: 2,
    salary_min: 240000, salary_max: 360000, salary_period: 'Per year',
    department: 'Support',
    description: 'Answer customer email and chat for our hiring platform. Weekend shifts are required '
      + 'on a rotating basis. This is a good first role if you enjoy helping people solve problems.',
    overview: 'Be the first human our customers talk to.',
    responsibilities: 'Reply to email and chat tickets.\n'
      + 'Walk customers through common setup steps.\n'
      + 'Pass real bugs to engineering with clear details.',
    required_skills: ['Communication', 'Email'],
    preferred_skills: ['Hindi', 'English'],
    qualifications: 'Any degree or final year of college.',
    experience_required: 'No experience required.',
    education_req: 'Any',
  },
];

const SEEKER_PROFILE = {
  headline: 'Frontend developer building fast, accessible React interfaces',
  about: 'I build React applications with a focus on accessibility and performance. '
    + 'Most of my work has been end to end: talking to users, designing the flow, writing the code, '
    + 'and fixing what breaks after launch. I care about interfaces that work on slow phones.',
  location: 'Bengaluru, Karnataka', current_title: 'React Developer', years_experience: 2,
  skills: ['React', 'JavaScript', 'CSS', 'HTML', 'TypeScript', 'Vite', 'Git'],
  languages: ['English', 'Hindi', 'Kannada'],
  linkedin: 'https://linkedin.com/in/neha-sharma', github: 'https://github.com/nehasharma',
  portfolio: 'https://nehasharma.example.com',
  expected_salary: '12 LPA', preferred_job_type: 'Full-time',
  preferred_location: 'Bengaluru', remote_preference: true, notice_period: '30 days',
};

// ---------------------------------------------------------------- run
console.log('\nSeeding demo data...\n');

// 1. Is the backend up?
const health = await call('/health');
if (health.status !== 200) {
  console.error('  Backend is not responding on ' + BASE);
  process.exit(1);
}

console.log('Accounts');
const empToken = await ensureUser(EMPLOYER);
const seekToken = await ensureUser(SEEKER);
await ensureUser(SEEKER2);

console.log('\nCompany profile');
const companyRes = await call('/companies/mine/company', { token: empToken });
if (companyRes.data?.company) skip(`company: ${companyRes.data.company.name}`);
else {
  const r = await call('/companies/company', { method: 'POST', token: empToken, body: COMPANY });
  ok(r.status === 200 ? `created company: ${COMPANY.name}` : `FAILED company -> ${r.status} ${JSON.stringify(r.data)}`);
}

console.log('\nJobs');
const mine = await call('/jobs/mine/list', { token: empToken });
const existingJobs = mine.data?.jobs ?? [];

// Only the demo employer's own jobs are ever deleted. The guard matters: a
// careless "clear the jobs table" would take real rows with it.
if (existingJobs.length) {
  if (FORCE) {
    for (const j of existingJobs) {
      const r = await call(`/jobs/${j.id}`, { method: 'DELETE', token: empToken });
      ok(r.status < 300 || r.status === 404 ? `deleted old job "${j.title}"` : `FAILED delete -> ${r.status}`);
    }
  } else {
    skip(`employer already has ${existingJobs.length} job(s) - use --force to rebuild them`);
  }
}

// Reached when there was nothing to delete, or when --force just cleared them.
if (!existingJobs.length || FORCE) {
  for (const j of JOBS) {
    const r = await call('/jobs', { method: 'POST', token: empToken, body: j });
    ok(r.status === 201 ? `added "${j.title}"` : `FAILED "${j.title}" -> ${r.status} ${JSON.stringify(r.data)}`);
  }
}

console.log('\nSeeker profile');
const profRes = await call('/profile', { method: 'PATCH', token: seekToken, body: SEEKER_PROFILE });
ok(profRes.status === 200 ? `Neha's profile filled in (${profRes.data.completion?.percent ?? '?'}% complete)` : `FAILED -> ${profRes.status} ${JSON.stringify(profRes.data)}`);

// Work history + education make the public profile realistic
const history = [
  { company: 'Nexlify Solutions', title: 'Frontend Developer', location: 'Bengaluru',
    start_date: '2023-04-01', is_current: true,
    description: 'Build and maintain the customer dashboard in React and TypeScript.' },
  { company: 'Brightlane', title: 'Junior Web Developer', location: 'Bengaluru',
    start_date: '2022-06-01', end_date: '2023-03-31',
    description: 'Built marketing sites and internal tools. Learned the fundamentals the hard way.' },
];
const edu = [{ institution: 'Visvesvaraya Technological University', degree: 'B.E.', field_of_study: 'Computer Science', start_year: 2018, end_year: 2022, grade: '8.4 CGPA' }];
for (const [label, kind, rows] of [['work history', 'experience', history], ['education', 'education', edu]]) {
  const have = await call(`/profile/sections/${kind}`, { token: seekToken });
  if ((have.data?.length ?? 0) > 0) skip(`${label}`);
  else for (const row of rows) {
    const r = await call(`/profile/sections/${kind}`, { method: 'POST', token: seekToken, body: row });
    ok(r.status === 201 ? `added ${kind}: ${row.company ?? row.institution}` : `FAILED ${kind} -> ${r.status} ${JSON.stringify(r.data)}`);
  }
}

// A resume has to EXIST before the apply form is useful. Without this every
// demo application attaches nothing, which is exactly the thing the employer
// side needs to show off (the applicants list downloads this file).
console.log('\nResume');
const haveResume = await call('/resumes', { token: seekToken });
if ((haveResume.data?.resumes?.length ?? 0) > 0) {
  skip(`resume: ${haveResume.data.resumes[0].file_name}`);
} else {
  // Built in memory, never written to disk. The upload route takes multipart
  // and only accepts PDF/DOC/DOCX, so a hand-built minimal PDF is the honest
  // thing to send - a text file pretending to be a PDF would be rejected, or
  // worse, accepted and then fail to open.
  const pdf = buildDemoPdf(SEEKER.fullName);
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'Neha-Sharma-Resume.pdf');
  const up = await callRaw('/resumes', { method: 'POST', token: seekToken, form });
  ok(up.status === 201 ? 'added resume: Neha-Sharma-Resume.pdf' : `FAILED resume -> ${up.status} ${JSON.stringify(up.data)}`);
}

/**
 * A tiny but genuinely valid one-page PDF. Every cross-reference table has to
 * agree on its byte offset, so the object numbers are fixed and `offsets` is
 * filled in as the objects are written.
 */
function buildDemoPdf(name) {
  const esc = (s) => s.replace(/([()\\\\])/g, '\\\\$1');
  const lines = [
    'BT /F2 20 Tf 60 760 Td (' + esc(name) + ') Tj ET',
    'BT /F1 11 Tf 60 730 Td (Frontend Developer - Bengaluru, India) Tj ET',
    'BT /F1 11 Tf 60 700 Td (Email: neha@mail.com  |  Phone: 9812345678) Tj ET',
    'BT /F2 13 Tf 60 660 Td (Skills) Tj ET',
    'BT /F1 11 Tf 60 640 Td (React, JavaScript, TypeScript, CSS, HTML, Vite, Git) Tj ET',
    'BT /F2 13 Tf 60 600 Td (Experience) Tj ET',
    'BT /F1 11 Tf 60 580 Td (Nexlify Solutions - Frontend Developer (2023 - present)) Tj ET',
    'BT /F1 11 Tf 60 560 Td (Builds and maintains the customer dashboard in React and TypeScript.) Tj ET',
    'BT /F1 11 Tf 60 530 Td (Brightlane - Junior Web Developer (2022 - 2023)) Tj ET',
    'BT /F1 11 Tf 60 510 Td (Built marketing sites and internal tools end to end.) Tj ET',
    'BT /F2 13 Tf 60 470 Td (Education) Tj ET',
    'BT /F1 11 Tf 60 450 Td (B.E. Computer Science, VTU, 2018 - 2022, 8.4 CGPA) Tj ET',
  ];

  const stream = lines.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
      + '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];

  // Byte offsets are cumulative: each object starts where the last one ended.
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return new TextEncoder().encode(out);
}

console.log('\nApplications');
const all = await call('/jobs?limit=50');
const jobs = all.data?.jobs ?? [];
const byTitle = (t) => jobs.find((j) => j.title === t);

for (const [title, cover, answers] of [
  ['React Developer',
    'I have spent two years building React interfaces and care a lot about accessibility and load performance, which is exactly what this role needs. Happy at the Bengaluru office twice a week.',
    [{ answer: 'Yes, I am comfortable at the Bengaluru office two days a week.' },
     { answer: 'https://github.com/nehasharma/portfolio-site' },
     { answer: '30 days' }]],
  ['Product Designer',
    'I mostly do frontend, but I have designed and shipped two internal tools end to end and would love to go further into product design.',
    null],
]) {
  const job = byTitle(title);
  if (!job) { console.log(`  ! job "${title}" not found - was it created?`); continue; }
  const qs = await call(`/jobs/${job.id}/questions`);
  const payload = { jobId: job.id, coverLetter: cover };
  // Attach answers so the employer sees a complete application.
  if (answers && qs.data?.questions?.length) {
    payload.answers = qs.data.questions.map((q, i) => ({ questionId: q.id, answer: answers[i]?.answer ?? '' }));
  }
  const r = await call('/applications', { method: 'POST', token: seekToken, body: payload });
  if (r.status === 201) ok(`Neha applied to "${title}"`);
  else if (r.status === 409) skip(`Neha already applied to "${title}"`);
  else console.log(`  ! apply "${title}" -> ${r.status} ${r.data.error || JSON.stringify(r.data)}`);
}

console.log('\nSaved job + notification');
const saved = await call('/jobs/saved', { token: seekToken });
if ((saved.data?.jobs?.length ?? 0) > 0) skip('saved jobs');
else {
  const intern = byTitle('Node.js Backend Intern');
  if (intern) {
    const r = await call(`/jobs/${intern.id}/save`, { method: 'POST', token: seekToken });
    ok(r.status === 201 ? 'Neha saved "Node.js Backend Intern"' : `! save -> ${r.status}`);
  }
}

const notifs = await call('/notifications', { token: empToken });
if ((notifs.data?.notifications?.length ?? 0) > 0) skip('employer notifications');
else console.log('  (none yet - notifications appear when a seeker applies)');

// ---------------------------------------------------------------- summary
console.log('\n--------------------------------------------------');
console.log('Done. Log in at http://localhost:5173 with:');
console.log(`  Employer   ${EMPLOYER.email} / ${PASSWORD}`);
console.log(`  Seeker     ${SEEKER.email} / ${PASSWORD}`);
console.log(`  Seeker 2   ${SEEKER2.email} / ${PASSWORD}`);
console.log('--------------------------------------------------\n');
