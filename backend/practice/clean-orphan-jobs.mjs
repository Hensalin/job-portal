/**
 * Removes leftover demo/test rows that were created outside the seed scripts.
 *
 * WHY THIS IS NEEDED: database/seed.sql and earlier testing left jobs whose
 * employer profile was later deleted (by reset-demo-users.mjs). They still have
 * status='active', so GET /api/jobs lists them, but GET /api/jobs/:id 404s
 * because the company join finds nothing. The UI then shows a job in the list
 * that opens to "This job no longer exists".
 *
 * It only deletes jobs with NO company attached, which is precisely the broken
 * shape. Real jobs always keep their company.
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
const BASE = `${env.SUPABASE_URL}/rest/v1`;

const get = async (p) => (await fetch(BASE + p, { headers: H })).json();

const companies = await get('/companies?select=id,name');
const companyIds = new Set((companies ?? []).map((c) => c.id));
const jobs = await get('/jobs?select=id,title,company_id,employer_id,status');
const orphans = (jobs ?? []).filter((j) => !j.company_id || !companyIds.has(j.company_id));

console.log(`${jobs?.length ?? 0} jobs, ${companies?.length ?? 0} companies`);
if (!orphans.length) {
  console.log('No orphaned jobs. Nothing to clean.');
} else {
  for (const j of orphans) {
    const r = await fetch(`${BASE}/jobs?id=eq.${j.id}`, { method: 'DELETE', headers: H });
    console.log(`  ${r.ok ? 'deleted' : 'FAILED'} "${j.title}" -> ${r.status}`);
  }
}

// Same problem for profiles with no auth user (test signups).
const profiles = await get('/profiles?select=id,email');
console.log(`\n${profiles?.length ?? 0} profiles exist.`);
console.log('Review with: node backend/practice/reset-demo-users.mjs');