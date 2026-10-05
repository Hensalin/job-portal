/**
 * Removes ONLY the throwaway accounts that the practice scripts create, and
 * everything hanging off them. Your own accounts, jobs, companies and
 * applications are left untouched.
 *
 *   cd job-portal
 *   node backend/practice/remove-test-data.mjs          <- shows the plan, deletes nothing
 *   node backend/practice/remove-test-data.mjs --go     <- deletes it
 *
 * WHY THIS EXISTS
 *   wipe-all-data.mjs empties the whole database. That is the wrong tool the
 *   moment you have typed real data into it, because it cannot tell your work
 *   from scratch data - it deletes both. This script can, because every account
 *   the practice scripts make has an obviously fake name:
 *
 *     seeker<timestamp>@gmail.com      from make-test-data.mjs
 *     employer<timestamp>@gmail.com    from make-test-data.mjs
 *     test<timestamp>@gmail.com        from browser walkthroughs
 *     real<timestamp>@gmail.com        from browser walkthroughs
 *
 *   A person typing their own email will never match that pattern, so an
 *   accidental run is harmless. That is the whole point: a cleanup tool you can
 *   run without reading the source first.
 *
 * HOW IT CASCADES
 *   It walks down the foreign keys by owner id instead of clearing tables:
 *
 *     profiles owned by the test users
 *       -> companies they own
 *          -> jobs they posted -> applications + interviews on those jobs
 *     resumes / saved_jobs / job_alerts / notifications / applications by user
 *
 *   So a job YOU posted survives even when a test account applied to it, and a
 *   job a test account posted goes away even if you applied to it. Each row is
 *   removed because of who OWNS it, not because of which table it sits in.
 *
 * A NOTE ON COLUMNS
 *   The column names are discovered with `?select=*&limit=1` rather than
 *   assumed. Guessing one wrong returns PostgREST error 42703 and the script
 *   stops halfway, which is exactly the half-deleted state to avoid.
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('backend/.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const key = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const REST = `${env.SUPABASE_URL}/rest/v1`;
const GO = process.argv.includes('--go');

/** The one pattern that identifies a throwaway account. */
const TEST_EMAIL = /^(seeker|employer|test|real)\d+@[^@\s]+$/;

const call = async (method, path, body) => {
  const r = await fetch(`${REST}${path}`, {
    method,
    headers: H,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    throw new Error(`${method} ${path} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.json().catch(() => null);
};

/**
 * Deletes rows and returns HOW MANY went.
 *
 * PostgREST answers a plain DELETE with 204 and an empty body, so the old script
 * got `null` back, printed nothing, and finished with "Done." Whether it had
 * deleted four rows or four thousand you could not tell from the output - which
 * is exactly the sort of thing that should never be true of a delete script.
 *
 * `Prefer: return=representation` makes it send the deleted rows back, so the
 * count is measured rather than guessed.
 */
const deleteRows = async (table, filter) => {
  const r = await fetch(`${REST}/${table}?${filter}`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=representation' },
  });
  if (!r.ok) {
    throw new Error(`DELETE /${table}?${filter} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  const body = await r.json().catch(() => null);
  return Array.isArray(body) ? body.length : 0;
};

/**
 * A query that is allowed to fail.
 *
 * WHY: an earlier version discovered column names with `?select=*&limit=1` and
 * only built a step if the column was in the result. But `select=*` on an EMPTY
 * table returns `[]` - there are no keys to read - so every step was silently
 * skipped and the script reported success having deleted almost nothing. Asking
 * the database directly and treating "no such column" as "skip this branch" is
 * the same decision, but it asks the authority instead of inferring from a
 * result that may be empty for a completely unrelated reason.
 *
 * Returns null on any 4xx, which means "this table or column is not here".
 */
const tryGet = async (path) => {
  const r = await fetch(`${REST}${path}`, { headers: H });
  if (!r.ok) return null;
  return r.json().catch(() => null);
};

/** PostgREST wants bare uuid values inside an in.(...) filter. */
const list = (values) => (values.length ? `in.(${values.join(',')})` : 'in.()');

// ------------------------------------------------------------------ find them
const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: H });
const authJson = await authRes.json().catch(() => ({}));
const allUsers = Array.isArray(authJson) ? authJson : (authJson.users ?? []);
const victims = allUsers.filter((u) => TEST_EMAIL.test(u.email || ''));

console.log(`\nSCANNED ${allUsers.length} account(s). Matched ${victims.length} test account(s).\n`);
if (!victims.length) {
  console.log('Nothing to remove. Your data was not touched.\n');
  process.exit(0);
}
for (const u of victims) console.log(`  ${u.email}   ${u.id}`);

const userIds = victims.map((u) => u.id);
const userFilter = list(userIds);

// ------------------------------------------------------- build the delete plan
const plan = [];
/** Every job id we have decided to delete, so step 4 can exclude them. */
const testJobIds = new Set();
const add = (table, filter, label) => plan.push({ table, filter, label });

/**
 * Rows that hang off a person.
 *
 * The column is `profile_id`, not `user_id`. Getting that wrong is silent in a
 * nasty way: PostgREST returns 400 "Could not find the 'user_id' column", the
 * old script's error filter treated that as "this table does not exist here",
 * printed "skipped", and moved on - so the resumes and saved jobs of every test
 * account survived while the script still reported success. Read the column
 * names off the migration files (database/migrations/*.sql), not off a guess.
 */
add('resumes', `profile_id=${userFilter}`, 'their resumes');
add('saved_jobs', `profile_id=${userFilter}`, 'their saved jobs');
add('job_alerts', `profile_id=${userFilter}`, 'their job alerts');
add('notifications', `profile_id=${userFilter}`, 'their notifications');
add('education', `profile_id=${userFilter}`, 'their education rows');
add('experience', `profile_id=${userFilter}`, 'their experience rows');
add('certifications', `profile_id=${userFilter}`, 'their certifications');
add('job_reports', `reporter_id=${userFilter}`, 'reports they filed');

/**
 * Deletes everything hanging off a set of applications, then the applications.
 *
 * `interviews`, `application_answers` and `recruiter_notes` all key off
 * `application_id`, NOT `job_id`. Filtering them by `job_id` returns 400
 * "column not found" - the same silent-skip trap as above. So the application
 * ids are selected first and passed down the chain.
 */
const purgeApplications = (appIds, label) => {
  if (!appIds.length) return;
  const f = list(appIds);
  add('interviews', `application_id=${f}`, `interviews on ${label}`);
  add('application_answers', `application_id=${f}`, `answers on ${label}`);
  add('recruiter_notes', `application_id=${f}`, `notes on ${label}`);
  add('applications', `id=${f}`, label);
};

/**
 * Deletes everything hanging off a set of jobs, then the jobs themselves.
 *
 * The ids are resolved with real SELECTs rather than an embedded
 * `job_id=in.(select id from jobs ...)` filter. PostgREST's simple filter
 * grammar does not accept a subquery there - it tries to parse the whole
 * string as a uuid list and fails with 22P02 - so the ids have to be fetched
 * first and pasted in.
 */
const purgeJobs = async (jobIds, jobLabel) => {
  if (!jobIds.length) return;
  jobIds.forEach((id) => testJobIds.add(id));
  const f = list(jobIds);
  const apps = await tryGet(`/applications?select=id&job_id=${f}`);
  if (apps) purgeApplications(apps.map((a) => a.id), `applications to ${jobLabel}`);

  add('job_skills', `job_id=${f}`, `skills of ${jobLabel}`);
  add('job_questions', `job_id=${f}`, `questions on ${jobLabel}`);
  add('jobs', `id=${f}`, jobLabel);
};

// 2. Companies they own, then the jobs inside those companies.
const owned = await tryGet(`/companies?select=id&owner_id=${userFilter}`);
if (owned) {
  const companyIds = owned.map((c) => c.id);
  if (companyIds.length) {
    const cf = list(companyIds);
    const cjobs = await tryGet(`/jobs?select=id&company_id=${cf}`);
    if (cjobs) await purgeJobs(cjobs.map((j) => j.id), 'jobs on their companies');
    add('companies', `id=${cf}`, 'their companies');
  }
}

// 3. Jobs they posted directly. This catches jobs whose company row is missing
//    or owned by someone else, which is common when a test employer posted
//    before the company profile existed.
const direct = await tryGet(`/jobs?select=id&employer_id=${userFilter}`);
if (direct) await purgeJobs(direct.map((j) => j.id), 'jobs they posted');

// 4. Applications a test user sent to a job that is NOT being deleted - most
//    likely a job YOU posted. The application itself is test junk and goes; the
//    job stays, because it is not ours to remove.
const sent = await tryGet(`/applications?select=id,applicant_id,job_id&limit=2000`);
if (sent) {
  const elsewhere = sent.filter(
    (a) => userIds.includes(a.applicant_id) && !testJobIds.has(a.job_id),
  );
  purgeApplications(elsewhere.map((a) => a.id), 'applications they sent to your jobs');
}

add('profiles', `id=${userFilter}`, 'their profiles');

if (!GO) {
  console.log('\nTHESE ROWS WOULD BE REMOVED (nothing deleted yet)\n');
  const seen = new Set();
  for (const step of plan) {
    const key = `${step.table}?${step.filter}`;
    if (seen.has(key)) continue;   // the same job can be reached by both paths
    seen.add(key);
    console.log(`  ${step.label}`);
  }
  console.log(`\n  plus ${victims.length} auth account(s)`);
  console.log('\nAdd --go when you are sure:\n');
  console.log('  node backend/practice/remove-test-data.mjs --go\n');
  process.exit(0);
}

// ------------------------------------------------------------------ do it
console.log('\nREMOVING\n');
let failed = 0;
const done = new Set();
for (const step of plan) {
  const key = `${step.table}?${step.filter}`;
  if (done.has(key)) continue;
  done.add(key);
  try {
    const n = await deleteRows(step.table, step.filter);
    if (n) console.log(`  removed  ${String(n).padStart(3)}  ${step.label}`);
  } catch (e) {
    // A table that does not exist is not a problem; anything else is worth saying.
    if (/PGRST20[35]|PGRST202|42P01|4270[34]|does not exist|not in the schema cache/i.test(e.message)) {
      console.log(`  skipped  ${step.label.padEnd(34)} (column not in this project)`);
    } else {
      console.log(`  FAILED   ${step.label.padEnd(34)} ${e.message}`);
      failed++;
    }
  }
}

let removedUsers = 0;
for (const u of victims) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (r.ok || r.status === 404) removedUsers++;
  else console.log(`  FAILED  user ${u.email} -> ${r.status}`);
}
console.log(`  removed  ${String(removedUsers).padStart(3)}  test accounts`);

console.log(
  failed
    ? `\n${failed} step(s) failed - see above. Your own data was never in the plan.\n`
    : '\nDone. Only test accounts were removed. Your data is untouched.\n',
);
process.exit(failed ? 1 : 0);