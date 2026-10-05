import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
}

// Service-role client: server-side only, bypasses RLS.
//
// IMPORTANT: supabase-js keeps auth state on the client instance. Calling
// signInWithPassword() / getUser(token) makes it attach the *end user's* JWT to
// every later request, which downgrades us from service_role to `authenticated`
// and re-enables RLS. That silently breaks profile lookups (you get
// "Profile not found." / 401 for any user other than the one who logged in last).
//
// So on every DATABASE request (anything under /rest/v1/) AND every STORAGE
// request (/storage/v1/) we pin apikey + Authorization to the service-role key.
// Auth requests (/auth/v1/) are left untouched, because those legitimately need
// the caller's own JWT.
//
// STORAGE MUST BE INCLUDED. The resume bucket is private and its RLS policies
// allow only the owner to insert. A /storage/v1/ call that slips through without
// the service-role key is treated as anonymous and fails with:
//     new row violates row-level security policy
// ...which surfaced as an unhelpful 500 on POST /resumes. Any backend-only API
// added later (functions, analytics) needs the same treatment.
const PINNED_PATHS = ['/rest/v1/', '/storage/v1/'];

const serviceRoleFetch = (innerFetch) => async (input, options = {}) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (PINNED_PATHS.some((p) => url.includes(p))) {
    const headers = new Headers(options.headers || {});
    headers.set('apikey', SUPABASE_SERVICE_ROLE_KEY);
    headers.set('Authorization', `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`);
    return innerFetch(input, { ...options, headers });
  }
  return innerFetch(input, options);
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: serviceRoleFetch(fetch) },
});

export default supabase;
