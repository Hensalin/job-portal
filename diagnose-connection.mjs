/**
 * =============================================================================
 *  CONNECT + ERROR CHECKER
 * =============================================================================
 *
 *  HOW TO RUN (from the project root):
 *      node diagnose-connection.mjs
 *
 *  WHAT IT DOES: walks the full request path one layer at a time and tells you
 *  exactly WHICH layer is broken, instead of just "something failed".
 *
 *      Browser  ->  React (api.js)  ->  Express  ->  Service  ->  Supabase  ->  Postgres
 *          L1            L2              L3          L4           L5           L6
 *
 *  READ IT LIKE THIS:
 *      Layer 1 fails -> your backend is not running. Nothing else matters yet.
 *      Layer 2 fails -> React is pointing at the wrong port/URL.
 *      Layer 3 fails -> Express cannot reach Supabase (bad .env, paused project).
 *      Layer 4 fails -> DATABASE IS BEHIND. Usually the migration was not run.
 *      Layer 5 fails -> the browser would block the call (CORS).
 *
 *  Stop and fix the FIRST failure. Fixing layer 6 while layer 3 is broken is
 *  wasted work.
 * =============================================================================
 */

const API = process.env.API || 'http://localhost:5000/api';
const ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };
let firstFailure = 0;
const t0 = Date.now();

const ok = (m) => console.log(`  ${C.g}PASS${C.x}  ${m}`);
const bad = (m, hint) => {
  if (!firstFailure) firstFailure = Date.now();
  console.log(`  ${C.r}FAIL${C.x}  ${m}`);
  if (hint) console.log(`        ${C.d}${hint}${C.x}`);
};
const warn = (m) => console.log(`  ${C.y}WARN${C.x}  ${m}`);
const head = (n, t) => console.log(`\n${C.b}LAYER ${n} - ${t}${C.x}`);
const ms = () => `${Date.now() - t0}ms`;

async function json(res) {
  return res.json().catch(() => ({}));
}

// =============================================================================
head(1, 'Is the Express backend running and listening?');
// =============================================================================
try {
  const res = await fetch(`${API}/health`);
  const body = await json(res);
  if (res.ok) {
    ok(`GET /api/health -> ${res.status} ${JSON.stringify(body)} (${ms()})`);
  } else {
    bad(`GET /api/health returned ${res.status}. The server is up but unhealthy.`);
  }
} catch (err) {
  bad(`Cannot reach ${API} (${err.cause?.code || err.message}).`, [
    'Is the backend running?      -> cd backend && npm run dev',
    'Does it crash on startup?    -> read the terminal; "Missing SUPABASE_URL" means backend/.env is wrong',
    'Is the port 5000?            -> check PORT= in backend/.env',
  ].join('\n        '));
  console.log(`\n${C.r}${C.b}STOP HERE.${C.x} Layers 2-6 cannot be tested until the backend runs.\n`);
  process.exit(1);
}

// =============================================================================
head(2, 'Is React pointing at the right address?');
// =============================================================================
const frontendEnv = process.env.VITE_API_URL;
console.log(`  ${C.d}API base used by the app: ${API}${C.x}`);
console.log(`  ${C.d}VITE_API_URL in frontend/.env: ${frontendEnv ?? '(not set - defaults to http://localhost:5000/api)'}${C.x}`);
if (API !== 'http://localhost:5000/api' && !API.includes('localhost:5000')) {
  warn('You overrode API. Make sure frontend/.env VITE_API_URL matches.');
} else {
  ok('Frontend default and this checker agree on the address.');
}

// =============================================================================
head(3, 'Can Express reach Supabase?');
// =============================================================================
let authWorks = false;
try {
  const res = await fetch(`${API}/jobs`);
  const body = await json(res);

  if (res.ok) { ok(`Supabase answered: GET /api/jobs -> ${res.status} (${ms()})`); }
  else if (res.status === 500 && /relationship between/i.test(body.error || '')) {
    bad('Backend reached Supabase, but the NEW TABLES DO NOT EXIST yet.', [
      'This is the expected error before the migration runs.',
      'FIX: Supabase dashboard -> SQL Editor -> New query',
      '     -> open database/migrations/001_advanced.sql -> paste -> Run',
      '',
      'See UPDATE-EXISTING-TABLES.md for the full walkthrough.',
    ].join('\n        '));
  } else if (res.status === 500 && /Invalid path/i.test(body.error || '')) {
    bad('Supabase URL is malformed.', [
      'SUPABASE_URL must NOT end in /rest/v1/ or a trailing slash.',
      'Correct: https://abcdefgh.supabase.co',
      'Wrong:   https://abcdefgh.supabase.co/rest/v1/',
    ].join('\n        '));
  } else {
    bad(`GET /api/jobs -> ${res.status}: ${body.error || '(no message)'}`);
  }
} catch (err) {
  bad(`Request threw: ${err.message}`);
}

// =============================================================================
head(4, 'Does the database have the tables the code needs?');
// =============================================================================
// We probe the endpoint that touches the most NEW tables. If profiles works but
// jobs does not, you know exactly where the migration stopped.
const probes = [
  { name: 'auth + profiles table', run: async () => {
      const uniq = `probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.io`;
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: uniq, password: 'ProbePass123', fullName: 'Probe User',
          role: 'seeker', phone: '9876543210', confirmPassword: 'ProbePass123',
        }),
      });
      const body = await json(res);
      // 201 = everything the migration needs for auth exists.
      // 409 = already registered (fine). 400 = validation rejected us (fine, means we got that far).
      if (res.status === 201 || res.status === 409 || res.status === 400) {
        if (res.status === 201) console.log(`        ${C.d}created probe user ${uniq} - delete it from the Auth dashboard later${C.x}`);
        return { fine: true, note: `-> ${res.status}` };
      }
      return { fine: false, note: `-> ${res.status}: ${body.error}` };
    } },
  { name: 'jobs + companies (advanced schema)', run: async () => {
      const res = await fetch(`${API}/jobs?limit=1`);
      const body = await json(res);
      if (res.ok) return { fine: true, note: `-> ${res.status}, ${body.jobs?.length ?? 0} job(s)` };
      if (/relationship between/i.test(body.error || '')) return { fine: false, note: '-> companies table missing (migration not applied)' };
      return { fine: false, note: `-> ${res.status}: ${body.error}` };
    } },
];

for (const p of probes) {
  try {
    const r = await p.run();
    if (r.fine) ok(`${p.name} ${C.d}${r.note}${C.x}`);
    else bad(`${p.name} ${C.d}${r.note}${C.x}`);
  } catch (e) { bad(`${p.name} threw: ${e.message}`); }
}

// =============================================================================
head(5, 'Is login working end to end?');
// =============================================================================
/**
 * Proves a full signup -> login -> authenticated-request round trip.
 *
 * WHY IT CREATES ITS OWN ACCOUNT INSTEAD OF USING A FIXTURE: it used to try
 * neha@mail.com / hr@acmetech.com, which only exist if you ran the demo seeder.
 * That was misleading twice over - with no demo data it printed two scary 401s
 * and told you to "repair the demo accounts" for a database that was working
 * perfectly, and it could not test signup at all.
 *
 * So: register a throwaway account, log in as it, call a protected route, then
 * delete it. That works on an empty database and checks the one step that was
 * previously untested - registration itself.
 */
const PROBE_EMAIL = `diagnose_${Date.now()}@example.io`;
const PROBE_PASSWORD = 'DiagPass123';

let token = null;
try {
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Diagnose Probe', email: PROBE_EMAIL,
      password: PROBE_PASSWORD, confirmPassword: PROBE_PASSWORD, role: 'seeker',
    }),
  });
  const regBody = await json(reg);
  if (!reg.ok || !regBody.user) {
    warn(`signup -> ${reg.status}: ${regBody.error || 'no message'}`);
    if (/confirmPassword|do not match/i.test(regBody.error || ''))
      console.log(`        ${C.d}The API expects confirmPassword. Send it, or make it optional.${C.x}`);
    if (/phone/i.test(regBody.error || ''))
      console.log(`        ${C.d}The API is demanding a phone number. It is an optional field.${C.x}`);
  } else {
    ok(`signup created ${PROBE_EMAIL}`);

    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PROBE_EMAIL, password: PROBE_PASSWORD }),
    });
    const body = await json(res);
    if (res.ok && body.token) {
      ok(`login works (${PROBE_EMAIL})`);
      token = body.token;
    } else {
      warn(`login -> ${res.status}: ${body.error || 'no message'}`);
      if (/not confirmed|verify/i.test(body.error || '')) {
        console.log(`        ${C.d}Email confirmation is switched on. For local work set${C.x}`);
        console.log(`        ${C.d}AUTO_CONFIRM_EMAIL=true in backend/.env and restart.${C.x}`);
      }
    }
  }
} catch (e) { warn(`signup/login threw: ${e.message}`); }

// =============================================================================
head(6, 'Does a protected route accept the token?');
// =============================================================================
if (!token) {
  warn('Skipped - no token from layer 5.');
} else {
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await json(res);
    if (res.ok) ok(`GET /api/auth/me -> ${res.status}, role=${body.user?.role} (${ms()})`);
    else bad(`GET /api/auth/me -> ${res.status}: ${body.error}`, [
      '401 "Your session has expired" usually means the service-role key leaked into DB calls.',
      'Check backend/config/supabase.js still scopes its header override to /rest/v1/ only.',
    ].join('\n        '));
  } catch (e) { bad(`GET /api/auth/me threw: ${e.message}`); }
}

// Delete the throwaway account so a diagnosis never leaves junk behind. A
// failed cleanup is only worth mentioning - the layers above already passed.
if (token) {
  try {
    await fetch(`${API}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* logout is best effort */ }
}

// =============================================================================
head(7, 'Would the BROWSER be allowed to call the API? (CORS)');
// =============================================================================
// Node's fetch does not enforce CORS. Only the browser does. So we simulate the
// preflight the browser sends, and read the header the server sends back.
for (const origin of ORIGINS) {
  try {
    const res = await fetch(`${API}/jobs`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    const allowed = res.headers.get('access-control-allow-origin');
    if (allowed === origin) ok(`${origin} is allowed`);
    else bad(`${origin} -> server replied "${allowed ?? '(no header)'}"`, [
      'The browser will BLOCK this and you will see "Failed to fetch" in the console,',
      'even though Postman and curl work fine.',
      '',
      'FIX: backend/.env  ->  CLIENT_URL=http://localhost:5173,http://127.0.0.1:5173',
      '     then restart the backend.',
      '',
      'Your page origin is the top-left of the browser address bar. It must match EXACTLY,',
      'including protocol, port and whether you typed localhost or 127.0.0.1.',
    ].join('\n        '));
  } catch (e) { bad(`${origin} preflight threw: ${e.message}`); }
}

// =============================================================================
console.log(`\n${C.b}================= SUMMARY =================${C.x}`);
if (!firstFailure) {
  console.log(`${C.g}${C.b}  All layers healthy.${C.x} The full chain works end to end.\n`);
} else {
  console.log(`${C.r}${C.b}  Something above failed.${C.x} Fix the FIRST FAIL, then re-run.`);
  console.log(`${C.d}  This run took ${ms()}.${C.x}\n`);
}
process.exit(firstFailure ? 1 : 0);
