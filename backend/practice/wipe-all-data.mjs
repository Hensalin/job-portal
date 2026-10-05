/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DESTRUCTIVE. DELETES REAL DATA THAT YOU TYPED IN.                      ║
 * ║  There is no undo and no backup.                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   cd job-portal
 *   node backend/practice/wipe-all-data.mjs
 *   ...then type  DELETE EVERYTHING  and press Enter
 *
 * WHY YOU HAVE TO TYPE THE WORDS
 *   This used to accept a plain `--yes` flag, which made it one careless command
 *   away from erasing a database you had spent hours filling in by hand. A flag
 *   can be typed by a script, a copy-paste, or an assistant working from memory.
 *   A phrase typed on purpose cannot. The cost is one extra line; the benefit is
 *   that this cannot run by accident.
 *
 * IF YOU JUST WANT THE TEST ACCOUNTS GONE, USE THE OTHER SCRIPT INSTEAD:
 *   node backend/practice/remove-test-data.mjs
 * That one only touches rows belonging to throwaway accounts (seeker123@,
 * employer123@, real123@, test123@ ...) and leaves everything you created alone.
 *
 * WHAT THIS REMOVES
 *   every row in every app table, every uploaded resume file, and every auth
 *   user. Afterwards the only things left in the UI are the ones you re-create.
 *
 * THE TABLE LIST IS HARDCODED ON PURPOSE. Asking PostgREST what tables exist
 * needs an OpenAPI root request that behaves differently depending on project
 * settings, and a silent "0 tables found" would mean "delete nothing" while
 * printing a success message. A hardcoded list either works or fails loudly.
 *
 * WHY CHILDREN FIRST: most of these tables reference each other with foreign
 * keys. Deleting `jobs` while `applications` still points at one returns a
 * constraint error, and a half-finished wipe is worse than no wipe.
 */
import fs from 'node:fs';
import { createInterface } from 'node:readline/promises';

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
const SKIP = ['spatial_ref_sys']; // PostGIS internals, not ours

/**
 * Children before parents.
 *
 * These names must match database/migrations/*.sql. Two entries here used to be
 * wrong - `application_notes` and `reports` do not exist; the real tables are
 * `recruiter_notes` and `job_reports`. A typo is not harmless: the script skips
 * unknown tables with a `?`, so the rows that mattered silently survived while
 * the run still printed "Done.".
 */
const TABLES = [
  // children first
  'recruiter_notes',
  'application_answers',
  'interviews',
  'notifications',
  'saved_jobs',
  'resumes',
  'job_reports',
  'job_alerts',
  'applications',
  'job_skills',
  'job_questions',
  'certifications',
  'experience',
  'education',
  // parents last
  'jobs',
  'companies',
  'profiles',
];

const CONFIRM_PHRASE = 'DELETE EVERYTHING';

/**
 * Counts rows by paging with `offset`, not by asking PostgREST for a total.
 *
 * `select=*` with no limit looks simpler but PostgREST caps a response at
 * `max-rows` (1000 by default) and just truncates, so a table with 3000 rows
 * would be reported as 1000. Asking for a short page and walking forward until
 * one comes back short cannot be wrong about a total.
 */
const PAGE = 1000;
const fetchPage = async (t, from) => {
  for (const sel of ['id', '*']) {
    const r = await fetch(`${REST}/${t}?select=${sel}&limit=${PAGE}&offset=${from}`, { headers: H });
    if (r.ok) return r.json().catch(() => null);
    if (r.status !== 400) return null;      // not a "bad column" problem
  }
  return null;                              // 400 on both: table is not here
};

const countRows = async (t) => {
  let seen = 0;
  for (let from = 0; ; from += PAGE) {
    const rows = await fetchPage(t, from);
    if (rows === null) return null;
    if (rows.length === 0) return seen;
    seen += rows.length;
    if (rows.length < PAGE) return seen;
  }
};

console.log('\nWHAT WILL BE DELETED\n');
let grand = 0;
for (const t of TABLES) {
  const n = await countRows(t);
  if (n === null) {
    console.log(`  ?  ${t.padEnd(20)} (table not found - skipped)`);
    continue;
  }
  if (n > 0) console.log(`  ${String(n).padStart(4)}  ${t}`);
  grand += n;
}

// The storage list endpoint REQUIRES a `prefix` key. Sending no body, or a body
// with only `limit`, comes back 400 "body must have required property 'prefix'".
// prefix: '' means the root of the bucket. Resumes live under <userId>/, so the
// root lists folders and each folder has to be listed again.
const listFolder = async (prefix) => {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/resumes`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000 }),
  }).catch(() => null);
  if (!r || !r.ok) return [];
  const body = await r.json().catch(() => []);
  return Array.isArray(body) ? body : [];
};

const roots = await listFolder('');
const files = [];
for (const entry of roots) {
  if (entry.id === null) files.push(...(await listFolder(entry.name)));  // a folder
  else files.push(entry);                                             // a file at the root
}

const usersRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: H });
const usersJson = await usersRes.json().catch(() => ({}));
const users = Array.isArray(usersJson) ? usersJson : (usersJson.users ?? []);

console.log(`  ${String(files.length).padStart(4)}  uploaded resume files`);
console.log(`  ${String(users.length).padStart(4)}  auth users (you will need to register again)`);
console.log(`\n  ${grand + files.length + users.length} rows in total.\n`);

/**
 * Lists the accounts that would be destroyed, with an asterisk on the ones that
 * look like real people.
 *
 * A row count is not enough to make this decision. "4 auth users" reads like
 * scratch data right up until you realise one of them is you. Seeing your own
 * address printed under a warning is what makes the decision an informed one -
 * and it is the moment most people type something other than the phrase.
 *
 * The same pattern remove-test-data.mjs uses to spot its own throwaways.
 */
const TEST_EMAIL = /^(seeker|employer|test|real)\d+@[^@\s]+$/;
if (users.length) {
  console.log('  THESE ACCOUNTS WOULD BE DELETED:');
  for (const u of users) {
    const scratch = TEST_EMAIL.test(u.email || '');
    console.log(`    ${scratch ? '(scratch) ' : '(REAL)     '}${u.email}`);
  }
  const real = users.filter((u) => !TEST_EMAIL.test(u.email || ''));
  if (real.length) {
    console.log(`\n  ${real.length} of these look like real accounts, not scratch data.`);
  }
  console.log('');
}

if (grand === 0 && files.length === 0 && users.length === 0) {
  console.log('Already empty. Nothing to do.\n');
  process.exit(0);
}

/**
 * Asks the human to type the phrase.
 *
 * Deliberately interactive. The previous version took a `--yes` flag, and that
 * is the kind of thing that gets typed by muscle memory, by a copied command,
 * or by an assistant that thinks a clean database is a better starting point
 * than the one you built. Reading the words back out of a terminal requires
 * someone to have understood that they are about to throw away their own work.
 *
 * There is no `--yes` escape hatch on purpose. If you want the test rows gone,
 * run remove-test-data.mjs instead - it cannot touch your data.
 */
const askConfirmation = async () => {
  if (!process.stdin.isTTY) {
    console.log('This script needs an interactive terminal so it can read your confirmation.');
    console.log('Open PowerShell or cmd and run it there by hand.');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n  ┌─────────────────────────────────────────────────────────┐');
    console.log('  │  THIS DELETES EVERY ROW AND EVERY ACCOUNT.             │');
    console.log('  │  THERE IS NO BACKUP AND NO UNDO.                        │');
    console.log('  └─────────────────────────────────────────────────────────┘\n');
    const typed = (await rl.question(`  Type  ${CONFIRM_PHRASE}  to continue, anything else to abort: `)).trim();
    if (typed !== CONFIRM_PHRASE) {
      console.log('\n  Aborted. Nothing was deleted.\n');
      process.exit(0);
    }
  } finally {
    rl.close();
  }
};

await askConfirmation();

console.log('Deleting...');
let failed = 0;

/**
 * Deletes every row in a table and returns how many actually went.
 *
 * It cannot assume the key is called `id`, and it cannot compare a uuid column
 * to a date. The first version used `?id=gte.1970-01-01`, which failed on
 * every table here: uuid keys reject a date literal (22P02), and saved_jobs /
 * job_skills have no `id` column at all (42703). So we read one row, take a
 * column that exists, and use PostgREST's `not.is.null` - which works for uuid,
 * text and composite keys alike.
 *
 * The count comes from `Prefer: return=representation`, which makes PostgREST
 * send the deleted rows back. It used to return `sample.length`, which is 1
 * because the sample was fetched with `limit=1` - so "cleared profiles (1)"
 * was printed after emptying a table that might have held a thousand rows. On a
 * delete script, a number that is not the number deleted is worse than no
 * number, because it looks like a receipt.
 */
const clearTable = async (t) => {
  const sample = await fetchPage(t, 0);
  if (!Array.isArray(sample) || !sample.length) return 0;   // already empty
  const key = Object.keys(sample[0])[0];
  const r = await fetch(`${REST}/${t}?${key}=not.is.null`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=representation' },
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  const body = await r.json().catch(() => null);
  return Array.isArray(body) ? body.length : 0;
};

for (const t of TABLES) {
  const n = await countRows(t);
  if (!n) continue;
  try {
    const gone = await clearTable(t);
    console.log(`  cleared  ${t} (${gone})`);
  } catch (e) {
    console.log(`  FAILED   ${t} (${n}) -> ${e.message}`);
    failed++;
  }
}

// Remove every stored file. Walk each "folder" because listing is non-recursive.
if (files.length) {
  const prefixes = [...new Set(files.map((f) => f.name.split('/')[0]))];
  let removed = 0;
  for (const prefix of prefixes) {
    const list = await (await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/resumes`, {
      method: 'POST', headers: H, body: JSON.stringify({ prefix, limit: 1000 }),
    })).json().catch(() => []);

    const paths = (Array.isArray(list) ? list : []).map((f) => `${prefix}/${f.name}`);
    for (const p of paths) {
      const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/resumes`, {
        method: 'DELETE',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [p] }),
      });
      if (r.ok) removed++;
    }
  }
  console.log(`  ${removed ? 'cleared' : 'FAILED '} storage files (${removed}/${files.length})`);
}

let deletedUsers = 0;
for (const u of users) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: H });
  if (r.ok || r.status === 404) deletedUsers++;
  else console.log(`  FAILED  user ${u.email} -> ${r.status}`);
}
console.log(`  deleted ${deletedUsers}/${users.length} auth users`);

console.log(`\n${failed ? `${failed} table(s) could not be cleared - see above.` : 'Done. The database is empty.'}`);
console.log('Register a fresh account at http://localhost:5173/register\n');
process.exit(failed ? 1 : 0);