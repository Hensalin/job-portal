/**
 * Promotes an existing account to admin, or creates one if you have no account
 * yet. Admin pages are impossible to reach otherwise: there is no signup path
 * that produces role='admin', so `/admin` would just redirect forever.
 *
 *   cd job-portal && node backend/practice/make-admin.mjs you@gmail.com
 *   cd job-portal && node backend/practice/make-admin.mjs newadmin@gmail.com Pass123
 *
 * Needs the service role key, so it talks to Supabase directly instead of the
 * API. Run it from the backend folder, or from here - it reads backend/.env by
 * relative path.
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

const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};
const AUTH = `${env.SUPABASE_URL}/auth/v1`;
const REST = `${env.SUPABASE_URL}/rest/v1`;

const email = process.argv[2];
const password = process.argv[3];

if (!email) {
  console.log(`
  Make an account an admin.

      node backend/practice/make-admin.mjs you@gmail.com
      node backend/practice/make-admin.mjs newadmin@gmail.com Pass123

  With no email you get a brand new admin account. With an email that already
  exists, that account is promoted - its password is left alone.
`);
  process.exit(0);
}

const list = await (await fetch(`${AUTH}/admin/users?per_page=200`, { headers: H })).json();
const existing = (list.users ?? []).find((u) => u.email.toLowerCase() === email.toLowerCase());

let user = existing;

if (!user) {
  if (!password) {
    console.error('That account does not exist. Pass a password to create it:\n  node backend/practice/make-admin.mjs you@gmail.com SomePass123');
    process.exit(1);
  }
  const res = await fetch(`${AUTH}/admin/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Could not create ${email}: ${JSON.stringify(body)}`);
    process.exit(1);
  }
  user = body;
  console.log(`created  ${email}`);
}

// The role lives in two places: auth metadata (read at login) and the profiles
// table (what every query actually filters on). Update both, or the user logs
// in as an admin and is then denied by the database.
const patch = await fetch(`${AUTH}/admin/users/${user.id}`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ user_metadata: { ...(user.user_metadata ?? {}), role: 'admin' } }),
});
if (!patch.ok) {
  console.error(`Could not set auth metadata: ${(await patch.text()).slice(0, 200)}`);
  process.exit(1);
}
console.log('auth metadata role -> admin');

/**
 * A profiles row is MANDATORY, and this is the step that is easy to forget.
 * POST /auth/register normally creates it, but creating an auth user directly
 * through the admin API does not. Without a row, login fails with a 404 and the
 * message "Profile not found." - which reads like a broken backend rather than
 * a missing row, and is exactly what happened the first time this was run.
 */
const name = (user.user_metadata?.full_name || email.split('@')[0]).trim();

// NB: no `email` column on profiles. The address lives on the auth user, and
// PostgREST rejects the whole request with PGRST204 if you include a column
// that does not exist - so it must be left out, not sent as null.
const insert = await fetch(`${REST}/profiles?on_conflict=id`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify({
    id: user.id,
    full_name: name,
    role: 'admin',
    is_active: true,
    email_verified: true,
  }),
});

if (!insert.ok) {
  console.error(`Could not create the profile row: ${(await insert.text()).slice(0, 300)}`);
  console.error('Login will fail with "Profile not found." until this succeeds.');
  process.exit(1);
}
console.log('profiles row present, role -> admin');

console.log(`
Done. Log out and back in, then open /admin

  ${email}${existing ? '' : `  /  ${password}`}
`);
