/*
 * ============================================================================
 *  DEBUGGING PRACTICE LAB  -  job-portal
 * ============================================================================
 *
 *  HOW TO USE
 *  ----------
 *  1. cd backend
 *  2. node practice/lab.mjs
 *  3. It prints 12 scenarios. Each one contains REAL code copied from this
 *     project with exactly ONE subtle bug in it.
 *  4. For each one: read the "SYMPTOM", work out WHY, then fix the code
 *     between the >>> <<< markers.
 *  5. Re-run. When a scenario says FIXED, move on.
 *  6. When it says "0 of 12 still broken" you have finished.
 *
 *  There is NO answer key inside this file. When you are genuinely stuck,
 *  read practice/answers.md - but try first. Struggling is the lesson.
 *
 *  Do NOT run this against the real database. Everything is in-memory.
 * ============================================================================
 */

let stillBroken = 0;
const results = [];

function check(id, title, symptom, isBuggy) {
  const state = isBuggy ? 'BUG PRESENT' : 'FIXED';
  if (isBuggy) stillBroken++;
  results.push({ id, state });
  console.log(`\n[${id}] ${title}`);
  console.log(`      symptom: ${symptom}`);
  console.log(`      status:   ${state}`);
}

// ---------------------------------------------------------------------------
// Tiny in-memory stand-in for Supabase so we can reproduce real behaviour
// (including RLS) without touching the real project.
// ---------------------------------------------------------------------------
function makeSupabase() {
  const db = { profiles: [], jobs: [], applications: [] };
  const client = {
    session: null,          // <-- supabase-js keeps auth state HERE, on the client
    key: 'service_role',

    from(table) {
      const applyRls = (rows) => {
        // The real database enforces RLS for non-service_role keys.
        if (this.key === 'service_role') return rows;
        const uid = this.session?.userId ?? null;
        if (table === 'profiles') return rows.filter((r) => r.id === uid);
        return rows;
      };
      return {
        select: () => ({
          eq: (col, val) => ({
            single: async () => {
              const found = applyRls(db[table]).filter((r) => r[col] === val);
              if (found.length !== 1) {
                const e = new Error(
                  found.length === 0
                    ? 'JSON object requested, multiple (or no) rows returned'
                    : 'multiple rows returned'
                );
                throw e; // this is what .single() really does
              }
              return found[0];
            },
          }),
        }),
      };
    },
    auth: {
      async signInWithPassword(userId) {
        // The real client stores the session on the INSTANCE.
        client.session = { userId };
        client.key = 'authenticated'; // user JWT replaces the service key
        return { session: { userId } };
      },
    },
  };
  return { client, db };
}

// ===========================================================================
// 1. ROUTE ORDER
// ===========================================================================
{
  // Real code: backend/routes/applicationRoutes.js
  // GET /mine must be declared BEFORE GET /:id, or "mine" is swallowed as an id.
  const routes = [
    { path: '/:id', handler: 'getApplicationById' }, // <-- BUG: greedy route first
    { path: '/mine', handler: 'myApplications' },
  ];
  function resolve(pathname) {
    for (const r of routes) {
      const pattern = new RegExp('^' + r.path.replace(':id', '([^/]+)') + '$');
      if (pattern.test(pathname)) return r.handler;
    }
    return '404';
  }
  // GET /api/applications/mine  should reach myApplications
  const hit = resolve('/mine');

  check(1, 'Express route matching order',
    'GET /api/applications/mine returns 404 because the server looks for an application whose id is literally "mine"',
    hit !== 'myApplications');

  /* >>> FIX HERE: reorder so /mine is declared BEFORE /:id <<< */
}

// ===========================================================================
// 2. MISSING BODY PARSER
// ===========================================================================
{
  // Real code: backend/server.js  (note: no app.use(express.json()) here)
  const app = { _bodyParser: null };
  function readBody(req) {
    return app._bodyParser ? req.body : undefined;
  }
  const req = { body: { title: 'React Developer' } };

  function createJob(req) {
    const body = readBody(req);
    const REQUIRED = ['title', 'company', 'location', 'description'];
    const missing = REQUIRED.filter((f) => !body?.[f]); // throws on undefined in real Express
    return { missing, ok: missing.length === 0 };
  }

  let crashed = null;
  let result = null;
  try { result = createJob(req); } catch (e) { crashed = e.message; }

  check(2, 'express.json() body parser',
    crashed
      ? `TypeError: ${crashed}  -> the request body never got parsed`
      : 'POST /api/jobs silently reports every field as missing even though the body was sent',
    !!crashed || !result.ok);

  /* >>> FIX HERE: make sure the body parser runs before the routes <<< */
}

// ===========================================================================
// 3. MISSING await  (async ownership check)
// ===========================================================================
{
  // Real code: backend/controllers/jobController.js ownJob()
  const job = { id: 'job-1', employer_id: 'employer-A' };
  const req = { user: { id: 'employer-B' }, params: { id: 'job-1' } };

  // BUG version: getJob is async but not awaited
  const getJob = async (id) => job;
  async function ownJob_BUG(req) {
    if (!(await getJob(req.params.id))) return null;
    return job;
  }
  async function ownJob_OK(req) {
    if (!(await getJob(req.params.id))) return null;
    if (job.employer_id !== req.user.id) return null; // the real check
    return job;
  }

  const viaBug = await ownJob_BUG(req);
  const viaOk = await ownJob_OK(req);

  check(3, 'Missing ownership check (IDOR)',
    'A different employer can edit/delete somebody else\'s job - the endpoint returns 200 instead of 403.',
    viaBug !== null && viaOk === null);

  /* >>> FIX HERE: add the employer_id comparison <<< */
}

// ===========================================================================
// 4. .single() ON ZERO ROWS
// ===========================================================================
{
  const { client, db } = makeSupabase();
  db.profiles.push({ id: 'user-1', full_name: 'Asha', role: 'seeker' });

  // BUG: .single() throws when the row does not exist. We want null.
  async function getJobById(id) {
    return client.from('jobs').select('*').eq('id', id).single();
  }

  let threw = false;
  let value;
  try { value = await getJobById('does-not-exist'); } catch { threw = true; }

  check(4, 'Supabase .single() vs .maybeSingle()',
    threw
      ? 'GET /api/jobs/<bad-id> returns 500 instead of a clean 404 {"error":"Job not found."}'
      : 'GET /api/jobs/<bad-id> returns null and the controller can send 404',
    threw);

  /* >>> FIX HERE: use .maybeSingle(), or catch the error and return null <<< */
}

// ===========================================================================
// 5. ROW LEVEL SECURITY LEAK  (the real bug you already fixed)
// ===========================================================================
{
  const { client, db } = makeSupabase();
  db.profiles.push({ id: 'emp-1', full_name: 'Ravi', role: 'employer' });
  db.profiles.push({ id: 'seek-1', full_name: 'Neha', role: 'seeker' });

  // The seeker logs in. On a shared client this mutates client state.
  await client.auth.signInWithPassword('seek-1');

  // Now the backend loads EMPLOYER emp-1's profile for /api/auth/me.
  let failed = false;
  try { await client.from('profiles').select('*').eq('id', 'emp-1').single(); }
  catch { failed = true; }

  check(5, 'Shared Supabase client leaks user session (RLS)',
    failed
      ? 'requireAuth throws "Profile not found." -> HTTP 401 "Your session has expired. Log in again." for anyone except the last user who logged in'
      : 'Profile lookup succeeds: every DB request is authenticated as service_role',
    failed);

  /* >>> FIX HERE: pin apikey + Authorization to the service key on /rest/v1/ requests <<< */
}

// ===========================================================================
// 6. POSTGREST .or() FILTER IS NOT ESCAPED
// ===========================================================================
{
  // Real code: backend/services/jobService.js listJobs()
  const jobs = [
    { title: 'React Developer', company: 'Acme', location: 'Chennai' },
    { title: 'Node Intern', company: 'Startup Labs', location: 'Remote' },
    { title: 'QA Engineer', company: 'Quality First', location: 'Bengaluru' },
  ];
  // Postgres/PostgREST filter grammar treats , ( ) as structure, not text.
  // So every "," the user types silently splits their search into extra terms.
  const buildFilter = (search, sanitize) => {
    const s = sanitize ? String(search).replace(/[,()]/g, ' ') : String(search);
    return `title.ilike.%${s}%,company.ilike.%${s}%,location.ilike.%${s}%`;
  };

  const searchTerm = 'Dev,Ops';
  const bugFilter = buildFilter(searchTerm, false);      // BUG: unsanitised
  const okFilter = buildFilter(searchTerm, true);        // real code sanitises

  // PostgREST splits the .or(...) body on ",". Every comma the user types
  // therefore injects extra, garbage conditions into the WHERE clause.
  const countConditions = (filter) => filter.split(',').length;

  const buggyCount = countConditions(bugFilter);
  const correctCount = countConditions(okFilter);

  check(6, 'Unescaped user input in a PostgREST .or() filter',
    buggyCount !== 3
      ? `GET /api/jobs?search=Dev,Ops builds a filter with ${buggyCount} conditions instead of 3 -> 500 "Invalid filter syntax" or silently wrong results`
      : 'Search terms are sanitised and the filter has exactly 3 conditions',
    buggyCount !== 3 && correctCount === 3);

  /* >>> FIX HERE: strip , ( ) from the search term before building the filter <<< */
}

// ===========================================================================
// 7. CASE-SENSITIVE SEARCH
// ===========================================================================
{
  // ilike = case-insensitive LIKE. Plain like is case-SENSITIVE.
  const rows = [{ title: 'React Developer' }, { title: 'react developer' }];
  const ilike = rows.filter((r) => r.title.toLowerCase().includes('react'.toLowerCase()));
  const like = rows.filter((r) => r.title.includes('react')); // BUG: case sensitive

  check(7, 'ilike vs like in search',
    like.length !== ilike.length
      ? `Searching "react" finds ${like.length} job(s) but the user expects ${ilike.length} - typing lowercase loses results.`
      : 'Search is case-insensitive',
    like.length !== ilike.length);

  /* >>> FIX HERE: make the comparison case-insensitive <<< */
}

// ===========================================================================
// 8. UNIQUE VIOLATION ERROR CODE
// ===========================================================================
{
  // Real code: backend/controllers/applicationController.js apply()
  // Postgres unique violation is SQLSTATE 23505.
  const pgErrorFromSupabase = { code: '23505', message: 'duplicate key value violates unique constraint' };

  function handle_BUG(error) {
    if (error.code === 'unique_violation') {   // <-- BUG: wrong value
      return { status: 409, error: 'You already applied to this job.' };
    }
    return { status: 400, error: error.message };
  }
  function handle_OK(error) {
    if (error.code === '23505') {
      return { status: 409, error: 'You already applied to this job.' };
    }
    return { status: 400, error: error.message };
  }

  const buggy = handle_BUG(pgErrorFromSupabase);
  const correct = handle_OK(pgErrorFromSupabase);

  check(8, 'Matching the Postgres unique-violation error code',
    buggy.status === 400
      ? `Applying twice returns a raw 400 "${buggy.error}" instead of a friendly 409 "You already applied to this job."`
      : 'Duplicate application returns 409',
    buggy.status !== 409 && correct.status === 409);

  /* >>> FIX HERE: compare against the real SQLSTATE code <<< */
}

// ===========================================================================
// 9. EMPTY ARRAY IS TRUTHY
// ===========================================================================
{
  // Real code: backend/controllers/jobController.js createJob()
  const REQUIRED = ['title', 'company', 'location', 'description'];
  const validBody = { title: 'Intern', company: 'Acme', location: 'Remote', description: 'Learn.' };

  function validate_BUG(body) {
    const missing = REQUIRED.filter((f) => !body[f]);
    if (missing) return { ok: false, error: `Missing: ${missing.join(', ')}` }; // BUG: [] is truthy!
    return { ok: true };
  }
  function validate_OK(body) {
    const missing = REQUIRED.filter((f) => !body[f]);
    if (missing.length > 0) return { ok: false, error: `Missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  const buggy = validate_BUG(validBody);
  const correct = validate_OK(validBody);

  check(9, 'Empty array is truthy',
    !buggy.ok && buggy.error === 'Missing: '
      ? 'POST /api/jobs ALWAYS returns 400 with the message "Missing: " even for a perfectly valid job - nothing can ever be posted'
      : 'A valid job body is accepted',
    !buggy.ok && buggy.error === 'Missing: ' && correct.ok);

  /* >>> FIX HERE: check .length, not the array itself <<< */
}

// ===========================================================================
// 10. REACT: WRONG OBJECT SPREAD ORDER
// ===========================================================================
{
  // Real code: frontend/src/pages/Login.jsx
  const e = { target: { name: 'email', value: 'neha@mail.com' } };
  const form = { email: '', password: '' };

  const BUG = { [e.target.name]: e.target.value, ...form };  // bug: old form wins
  const OK = { ...form, [e.target.name]: e.target.value };

  check(10, 'React state object spread order',
    BUG.email !== 'neha@mail.com'
      ? `Typing an email leaves the field empty (value stayed "${BUG.email}") - the form appears frozen`
      : 'Typing updates the field',
    BUG.email === '' && OK.email === 'neha@mail.com');

  /* >>> FIX HERE: spread the old state FIRST <<< */
}

// ===========================================================================
// 11. REACT: useEffect WITH NO DEPENDENCY ARRAY
// ===========================================================================
{
  // Real code: frontend/src/pages/Dashboard.jsx / Jobs.jsx
  // useEffect with no dependency array runs after EVERY render.
  // If it calls setState, that schedules another render -> runs the effect again.
  function simulate(hasDepsArray) {
    let renders = 0;
    const MAX = 100;                       // React throws at ~50 nested updates
    while (renders < MAX) {
      renders++;
      // An effect with [] only runs on the first render.
      const effectRuns = !hasDepsArray || renders === 1;
      if (!effectRuns) break;
      // effect body calls load() -> setState(...) -> triggers render
    }
    return renders;
  }

  const noDeps = simulate(false);
  const withDeps = simulate(true);

  check(11, 'useEffect without a dependency array',
    noDeps > 50
      ? `The effect re-fires forever (${noDeps} renders) -> blank page and "Maximum update depth exceeded"`
      : `Effect runs once then stops (${noDeps} renders)`,
    noDeps > 50 && withDeps < 50);

  /* >>> FIX HERE: pass a dependency array to useEffect <<< */
}

// ===========================================================================
// 12. CORS: WRONG ALLOWED ORIGIN
// ===========================================================================
{
  // Real code: backend/server.js
  const CLIENT_URL = 'http://localhost:5173';
  const incomingOrigin = 'http://127.0.0.1:5173'; // same app, typed differently

  const corsMiddleware = (origin) => (origin === CLIENT_URL ? null : 'CORS blocked');

  const blocked = corsMiddleware(incomingOrigin);
  const allowed = corsMiddleware(CLIENT_URL);

  check(12, 'CORS origin must match exactly',
    blocked
      ? 'Browser blocks every API call ("blocked by CORS policy") but curl.exe works fine - the classic confusing bug'
      : 'Both localhost and 127.0.0.1 are accepted',
    !!blocked && !allowed);

  /* >>> FIX HERE: allow a list of dev origins <<< */
}

// ===========================================================================
console.log('\n' + '='.repeat(72));
console.log(`  ${stillBroken} of 12 scenarios still broken`);
console.log('='.repeat(72));
if (stillBroken === 0) console.log('  All fixed. Now go break the real app on purpose - practice/README.md');
console.log('');