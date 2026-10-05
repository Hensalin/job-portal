/**
 * Counts every row in every public table, plus auth users and stored files.
 * Read-only. Run this to see what fake/demo data is actually in there.
 *
 *   cd job-portal && node backend/practice/list-all-data.mjs
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
const H = { apikey: key, Authorization: `Bearer ${key}` };
const BASE = `${env.SUPABASE_URL}/rest/v1`;

/**
 * The table list is hardcoded, not discovered.
 *
 * The natural way is to GET the PostgREST root and read `tables` from the
 * OpenAPI document. On this project that request comes back with no table list,
 * so the loop iterated zero times and printed "0 rows total" - for a database
 * that was full. wipe-all-data.mjs hardcodes its list for the same reason, and
 * a missing table just prints "?" instead of quietly vanishing.
 *
 * These names match database/migrations/*.sql.
 */
const TABLES = [
  'profiles', 'companies', 'jobs', 'applications', 'interviews', 'recruiter_notes',
  'application_answers', 'resumes', 'saved_jobs', 'job_alerts', 'notifications',
  'education', 'experience', 'certifications', 'job_skills', 'job_questions',
  'job_reports',
];

console.log('=== ROWS PER TABLE ===');
let total = 0;

/**
 * Counts a table by fetching its ids and counting them.
 *
 * The obvious way to do this is `Prefer: count=exact` plus `Range: 0-0` and
 * read the total out of `content-range`. That is what this used to do, and it
 * reported "0 rows total" on a database that had a job, two applications and a
 * company in it - because Node's fetch silently drops the `Range` header, so
 * `content-range` never arrived and the expression fell through to comparing
 * the string '?' against '0'. A counting tool that always says zero is worse
 * than no tool: it looks like proof that the database is clean.
 *
 * Fetching the ids and counting them cannot silently return a wrong answer.
 */
const PAGE = 1000;

/**
 * Fetches one page, choosing a column that exists.
 *
 * `select=id` is wrong for saved_jobs (composite key profile_id + job_id) and
 * job_skills (no id at all) - PostgREST answers 400 and the table would be
 * reported as missing. Falling back to `select=*` costs nothing and counts
 * them properly.
 */
const fetchPage = async (name, from) => {
  for (const sel of ['id', '*']) {
    const r = await fetch(`${BASE}/${name}?select=${sel}&limit=${PAGE}&offset=${from}`, { headers: H });
    if (r.ok) return r.json().catch(() => null);
    if (r.status !== 400) return null;         // not a "bad column" problem
  }
  return null;
};

const countRows = async (name) => {
  let seen = 0;
  for (let from = 0; ; from += PAGE) {
    const rows = await fetchPage(name, from);
    if (rows === null) return null;            // table missing or blocked
    if (rows.length === 0) return seen;
    seen += rows.length;
    if (rows.length < PAGE) return seen;       // short page means that was the end
  }
};

for (const name of TABLES) {
  const count = await countRows(name);
  if (count === null) {
    console.log(`     ?  ${name}  (table not in this project)`);
    continue;
  }
  if (count > 0) {
    console.log(`  ${String(count).padStart(5)}  ${name}`);
    total += count;
  }
}
console.log(`  ---- ${total} rows total (only non-empty tables listed)`);

console.log('\n=== AUTH USERS ===');
const users = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, { headers: H });
const ul = await users.json();
const list = Array.isArray(ul) ? ul : (ul.users ?? []);
console.log(`  ${list.length} user(s)`);
for (const u of list) console.log(`  - ${u.email}  (${u.role ?? 'no role'})`);

console.log('\n=== STORAGE ===');
const b = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, { headers: H });
const bl = await b.json().catch(() => []);
for (const bucket of Array.isArray(bl) ? bl : []) {
  // Resumes are stored as <userId>/<fileName>, so the top level is one folder
  // per user. The endpoint REQUIRES a `prefix` key - sending no body at all
  // comes back 400 "body must have required property 'prefix'", and omitting
  // the key while including limit does the same. prefix: '' means "the root".
  const roots = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket.id}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000 }),
  });
  const rootList = await roots.json().catch(() => null);
  if (!Array.isArray(rootList)) {
    console.log(`  bucket "${bucket.id}": could not be listed`);
    continue;
  }

  let count = 0;
  const names = [];
  for (const entry of rootList) {
    // Directories come back with id === null; files have a real id.
    if (entry.id === null) {
      const inner = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket.id}`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: entry.name, limit: 1000 }),
      });
      const files = await inner.json().catch(() => []);
      if (Array.isArray(files)) {
        count += files.length;
        files.forEach((f) => names.push(`${entry.name}/${f.name}`));
      }
    } else {
      count += 1;
      names.push(entry.name);
    }
  }
  console.log(`  bucket "${bucket.id}": ${count} file(s)`);
  for (const n of names.slice(0, 10)) console.log(`    - ${n}`);
  if (names.length > 10) console.log(`    ... and ${names.length - 10} more`);
}