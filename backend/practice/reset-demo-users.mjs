/**
 * Creates (or repairs) the demo accounts with a password that passes the
 * strong-password rules, and marks their email as CONFIRMED so they can log in
 * without waiting for a verification email.
 *
 *   cd backend && node practice/reset-demo-users.mjs
 *
 * WHY THIS EXISTS AND WHY IT IS SEPARATE FROM seed-demo.mjs:
 *   seed-demo.mjs talks only to the public HTTP API, exactly like a real user.
 *   That is good for teaching, but it cannot set email_confirm or reset an
 *   existing password. This script uses the service-role key directly, so it
 *   must stay in backend/ and must never be shipped to the frontend.
 *
 * SAFE TO RE-RUN. Use it when you forget a demo password or change the rules.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Load backend/.env by ABSOLUTE path, not by looking in the current folder.
// `import 'dotenv/config'` reads process.cwd()/.env, so running this file from
// the project root - which is how the runbook tells you to run it - silently
// loads nothing and fails with the useless "supabaseUrl is required".
const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
if (existsSync(envPath)) loadEnv({ path: envPath });

const PASSWORD = 'Demo1234';

const USERS = [
  { email: 'hr@acmetech.com', fullName: 'Ravi Menon', role: 'employer', phone: '9876543210' },
  { email: 'neha@mail.com', fullName: 'Neha Sharma', role: 'seeker', phone: '9812345678' },
  { email: 'imran@mail.com', fullName: 'Imran Khan', role: 'seeker', phone: '9712345678' },
];

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Writes the profile row, tolerating a database that has NOT had the migration
 * applied yet. `email_verified` / `is_active` only exist after 001_advanced.sql,
 * so we retry with just the original three columns and say so out loud.
 */
async function upsertProfile(id, u) {
  const rich = {
    id, full_name: u.fullName, role: u.role, phone: u.phone,
    email_verified: true, is_active: true,
  };
  const { error } = await admin.from('profiles').upsert(rich, { onConflict: 'id' });
  if (!error) return 'full';

  if (/email_verified|is_active/.test(error.message)) {
    const { error: e2 } = await admin.from('profiles').upsert(
      { id, full_name: u.fullName, role: u.role }, { onConflict: 'id' }
    );
    if (e2) throw new Error(e2.message);
    return 'basic';
  }
  throw new Error(error.message);
}

console.log('\nResetting demo accounts...\n');

for (const u of USERS) {
  // 1. Does this user already exist?
  let existing = null;
  const { data: found, error: findErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (findErr) {
    console.log(`  ! could not list users: ${findErr.message}`);
    process.exit(1);
  }
  existing = found.users.find((x) => x.email?.toLowerCase() === u.email);

  if (existing) {
    // 2. Repair: new password + confirmed email + fresh profile row.
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.fullName, role: u.role },
    });
    if (error) { console.log(`  ! ${u.email}: ${error.message}`); continue; }

    try {
      await upsertProfile(existing.id, u);
      console.log(`  updated  ${u.role.padEnd(8)} ${u.email}`);
    } catch (e) {
      console.log(`  ! ${u.email} profile: ${e.message}`);
      continue;
    }
  } else {
    // 3. Create confirmed from the start - no verification email needed.
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: u.fullName, role: u.role },
    });
    if (error) { console.log(`  ! ${u.email}: ${error.message}`); continue; }

    try {
      await upsertProfile(data.user.id, u);
      console.log(`  created  ${u.role.padEnd(8)} ${u.email}`);
    } catch (e) {
      await admin.auth.admin.deleteUser(data.user.id);
      console.log(`  ! ${u.email} profile insert failed (${e.message}). Run the migration first.`);
      continue;
    }
  }
}

console.log('\n--------------------------------------------------');
console.log('All demo accounts now use this password:', PASSWORD);
USERS.forEach((u) => console.log(`  ${u.role.padEnd(8)} ${u.email}`));
console.log('--------------------------------------------------\n');
