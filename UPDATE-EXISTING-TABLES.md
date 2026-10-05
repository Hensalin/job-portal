# How the three pieces connect, and how to update the tables you already have

A plain-language guide. Read Part 1 to understand the wiring, Part 2 to change
the database, Part 3 to fix things when they break.

---

# PART 1 — How React, Express and Supabase actually talk

## The one picture that matters

```
   +------------------+        +------------------+        +------------------+
   |  1. BROWSER      |        |  2. BACKEND       |        |  3. DATABASE     |
   |                  |        |                  |        |                  |
   |  React (Vite)    |  HTTP  |  Express         |  HTTPS |  Supabase        |
   |  port 5173       | -----> |  port 5000       | -----> |  (Postgres)      |
   |                  |  JSON  |                  |  SQL   |                  |
   |  src/services/   | <----- |  routes ->       | <----- |  tables,         |
   |    api.js        |  JSON  |  controllers ->  |  rows  |  rows, RLS       |
   +------------------+        |  services        |        +------------------+
                               +------------------+
```

**The key idea:** the browser can never talk to the database directly. If it
could, anyone could open DevTools and read or delete your whole database.
So the browser only ever talks to your Express server, and *your server* is the
only thing allowed to touch the database.

---

## Step-by-step: what happens when you search for jobs

1. **You type "react" and press Enter** in `frontend/src/pages/Jobs.jsx`.
2. **The page calls a function** from `frontend/src/services/api.js`.
3. **api.js runs `fetch()`** to `http://localhost:5000/api/jobs?search=react`.
   It attaches your login token in the `Authorization` header if you have one.
4. **Express receives it.** `backend/routes/jobRoutes.js` matches the URL and
   calls a controller.
5. **The controller** (`controllers/jobController.js`) does nothing but check
   the request and hand off to a service.
6. **The service** (`services/jobService.js`) builds the database query.
7. **supabase-js** converts that into an HTTPS call to Supabase and returns rows.
8. **The service reshapes** the database rows (`id`, `title`, ... becomes
   `id`, `title`, ...) so the frontend gets clean names.
9. **The whole JSON comes back**, through all the layers in reverse.
10. **api.js returns the data**, React re-renders, you see the jobs.

The layer order in our code:

```
routes  ->  controllers  ->  services  ->  supabase-js  ->  Postgres
```

**Why so many files?** Each one has one job:
- `routes` = *which* URLs exist
- `controllers` = *what happens* for a request (HTTP in, HTTP out)
- `services` = *the actual business logic and database work*

---

## The three places a URL appears (this causes most beginner bugs)

| What             | Where it lives                    | Who reads it |
|------------------|-----------------------------------|--------------|
| Backend -> DB    | `backend/.env` → `SUPABASE_URL`   | Express      |
| React -> Backend | `frontend/.env` → `VITE_API_URL`  | Vite, at build time |
| Which browsers may call the API | `backend/.env` → `CLIENT_URL` | Express (CORS) |

### The `VITE_` prefix matters

Vite only exposes environment variables to frontend code if they start with
`VITE_`. That is a safety feature: it stops you accidentally shipping a secret
to the browser. `SUPABASE_SERVICE_ROLE_KEY` has no `VITE_` prefix, so it can
**never** reach the frontend. Do not add a `VITE_` prefix to any secret. Ever.

### Why `CLIENT_URL` exists

Browsers block cross-origin requests unless the server explicitly says
"I allow this website". `CLIENT_URL` is that list. This is why your app can
fail in the browser but work perfectly in Postman — Postman ignores the rule.

---

# PART 2 — Updating the tables you already have

## The concept: schema.sql vs migrations

| File | Purpose |
|------|---------|
| `database/schema.sql` | Creates the **original** tables. You already ran this. Running it again is harmless (`IF NOT EXISTS`). |
| `database/migrations/001_advanced.sql` | **Changes** existing tables and adds new ones. **This is the one you need to run now.** |

`001_advanced.sql` is written to be **safe to run**:
- `ADD COLUMN IF NOT EXISTS` → adding the same column twice does not error
- `DROP ... IF EXISTS` before each `ADD CONSTRAINT` → no duplicate constraint
- It **never deletes your existing rows**

---

## How to run it — step by step

1. Open <https://supabase.com> and sign in.
2. Click your project (`txulmotztjxgxpxugpkh`).
3. In the left sidebar click **SQL Editor**.
4. Click **New query**.
5. Open `database/migrations/001_advanced.sql` in VS Code.
6. Select all (`Ctrl+A`), copy (`Ctrl+C`).
7. Paste into the SQL Editor.
8. Click **Run** (bottom right).
9. Wait for the green **"Success. No rows returned"** banner.

That is it. Then re-run the checker:

```bash
node diagnose-connection.mjs
```

---

## How to verify each part actually landed

After running the SQL, look inside Supabase to confirm:

### 1. Tables exist
**Table Editor** (left sidebar). You should now see **18 tables**:
```
applications   certifications   companies          education
experience      job_alerts       job_questions      job_reports
job_skills      jobs             notifications      profiles
recruiter_notes  resumes         saved_jobs         interviews
```
Before the migration there were only 3 (`profiles`, `jobs`, `applications`).

### 2. New columns exist on `profiles`
Click `profiles` → **Data** or the **Structure** tab. You should see new
columns: `phone`, `headline`, `about`, `skills`, `years_experience`,
`email_verified`, `is_active`, `updated_at`, and more.

### 3. The role check now allows `admin`
Go to **SQL Editor** and run this query:
```sql
select conname, pg_get_constraintdef(oid) as rule
from pg_constraint
where conname in ('profiles_role_check','applications_status_check','jobs_type_check');
```
You want to see:
- `profiles_role_check` → `role = ANY (ARRAY['seeker','employer','admin'])`
- `applications_status_check` → includes `shortlisted`, `interview`, `offer`, `hired`
- `jobs_type_check` → includes `Freelance`, `Temporary`, `Remote`

If it still says only `seeker|employer`, the SQL did not run. Re-run it.

### 4. The private resume bucket exists
**Storage** (left sidebar) → you should see a bucket named `resumes`.
It must be **Private** (not green/Public). Resumes are private because one
company must not be able to read another company's applicants' files.

### 5. Data survived
**Table Editor** → `jobs` → **Data**. Your old rows should still be there.
If the table is empty, you were on the wrong project.

---

## What the migration actually does, and why

| Change | Reason |
|--------|--------|
| `profiles_role_check` now allows `admin` | The app needs an admin role for moderation. Without this, setting a user to admin fails with a check-constraint error. |
| `jobs_type_check` adds `Freelance`, `Temporary`, `Remote` | The product spec lists these job types; the old constraint rejected them. |
| `applications_status_check` replaced | `pending / accepted / rejected` (3 states) is replaced by a real hiring pipeline: applied → viewed → shortlisted → interview → assessment → offer → hired, plus rejected / withdrawn. |
| New `companies` table | Employers need a profile separate from their login account. |
| New `job_questions` + `application_answers` | Employers ask custom questions; answers are stored per application, not per user, so history stays intact. |
| New `saved_jobs` | Composite primary key `(profile_id, job_id)` makes a duplicate save impossible at the database level, not just in code. |
| New `resumes` table + private bucket | Files live in Supabase Storage; only metadata goes in Postgres. |
| New `notifications`, `interviews`, `recruiter_notes`, `job_alerts`, `job_reports` | The remaining features. |
| `jobs.updated_at`, `applications.updated_at` | Needed to show "last updated" and order by recency. |
| Indexes (`idx_jobs_status` etc.) | Without these, filtering grows slower as data grows. |

### A note on why `resumes` is created *before* `applications` in the file

`applications.resume_id` is a foreign key pointing at `resumes.id`. Postgres
cannot create a foreign key to a table that does not exist yet. The file is
ordered so `resumes` comes first. If you ever see
`relation "resumes" does not exist`, your file order got shuffled.

---

# PART 3 — Finding and fixing errors

## The rule that saves the most time

**Fix the FIRST failure, top to bottom. Never work on a later layer while an
earlier one is broken.** A symptom at layer 6 is often caused at layer 3.

## Run the checker first, always

```bash
node diagnose-connection.mjs
```

It prints one line per layer and tells you where to look.

---

## Error → cause → fix

### "Failed to fetch" in the browser console

The browser refused the request before the app could read the answer.

| Real cause | How to tell | Fix |
|------------|-------------|-----|
| Backend not running | Checker layer 1 fails | `cd backend && npm run dev` |
| Wrong port/URL | Checker layer 2 | check `frontend/.env` → `VITE_API_URL` |
| **CORS** | Checker layer 7 fails, but Postman/curl work | add your exact page origin to `CLIENT_URL`, then **restart the backend** |
| Mixed `localhost` / `127.0.0.1` | Checker layer 7 passes for one, fails for the other | they are different origins; add both |

CORS is the most common cause and the most confusing, because the server
returns a perfectly good response that the browser throws away.

Check your page's real origin in the **top-left of the browser address bar**.
It must match `CLIENT_URL` exactly — protocol, host, and port.

---

### "Invalid path specified in request URL"

`SUPABASE_URL` has extra characters. This bug already bit this project once.

```
CORRECT:  https://txulmotztjxgxpxugpkh.supabase.co
WRONG:    https://txulmotztjxgxpxugpkh.supabase.co/rest/v1/
WRONG:    https://txulmotztjxgxpxugpkh.supabase.co/
```
supabase-js appends `/rest/v1/...` itself. Adding it yourself doubles the path.

---

### "Could not find a relationship between 'jobs' and 'companies'"

**The migration has not been run.** Your code is asking for a table that does
not exist yet. Go to Part 2.

---

### "Your session has expired" / "Profile not found." (401)

Almost always the service-role leak: after `signInWithPassword()` the shared
supabase-js client started attaching the *end user's* JWT to database calls,
which downgraded `service_role` → `authenticated` and turned Row Level Security
back on. Symptom: it works for whoever logged in *most recently*, and fails for
everyone else.

The fix is already in `backend/config/supabase.js`: a `serviceRoleFetch`
wrapper that pins the service-role headers **only** on `/rest/v1/` URLs.

> **Do not "simplify" that file by removing the wrapper.** If you set the
> headers on *every* request, the auth endpoints get the wrong token and every
> login returns 401. The `/rest/v1/` scope is load-bearing.

---

### `400 Malformed JSON`

The frontend sent broken JSON. In `api.js`, `body` must be a plain object —
`JSON.stringify` handles it. Do not pass a pre-stringified string.

---

### `401` from Postman but the app works

Your token expired or you forgot the header. The header must be exactly:
```
Authorization: Bearer eyJhbGciOi...
```
`Bearer` + one space + the raw token. No quotes.

### `403` "Only employers can do this."

Correct behaviour — the route is protected by `requireRole('employer')`. Your
account's role is `seeker`. Log in with an employer account, or check the role
in **Table Editor → profiles → role**.

### `400 "Company is required."` when posting a job

Your employer account has no company profile yet, so the job has no company to
attach to. Either fill in **Company profile** first, or type the company name
into the "Company" field on the post-a-job form. Both work — the form value
wins.

### `409 "That record already exists."`

A unique constraint stopped a duplicate. Usually correct: applying twice to the
same job, or registering an email that exists.

### `429 Too many requests`

Rate limiting on login/register is working (5 registrations and 10 logins per
minute per IP). Wait a minute, or restart the backend to clear the counters.

---

## Where to look when the error is not in the browser

**Terminal order matters:**

1. **Backend terminal** — the `console.error('[unhandled]', err)` line prints
   the real stack trace. This is your single best source of truth.
2. **Browser DevTools → Console** — shows the request that failed and its status.
3. **Browser DevTools → Network → click the failed row** — shows the exact URL,
   request body, and response body.
4. **Supabase → Logs → API** — shows the raw SQL and any Postgres error.
5. **Supabase → Logs → Auth** — for login, registration and email problems.

---

## Re-seeding demo data

The seed script creates three accounts, a company, five jobs, a full seeker
profile and two applications. **Run it AFTER the migration**, because it fills
the new tables too.

```bash
# 1. make sure the demo logins exist and work (password + email confirmation)
node backend/practice/reset-demo-users.mjs

# 2. fill the database with realistic content
node backend/practice/seed-demo.mjs
```

Both scripts are safe to re-run. They check what already exists first.

| Role | Email | Password |
|------|-------|----------|
| Employer | `hr@acmetech.com` | `Demo1234` |
| Seeker | `neha@mail.com` | `Demo1234` |
| Seeker | `imran@mail.com` | `Demo1234` |

> **Why the password is `Demo1234` and not `demo1234`:** registration enforces
> a strong password (8+ characters, upper case, lower case, and a digit), so the
> seed data has to follow the same rule. If you change the rules in
> `backend/utils/validators.js`, re-run `reset-demo-users.mjs`.

**Why two scripts?** `seed-demo.mjs` talks only to the public HTTP API, exactly
like a real user — which makes it good for learning. But a public API cannot set
`email_confirm` or reset an existing password. `reset-demo-users.mjs` uses the
service-role key directly to do those things. It must stay inside `backend/`
and must never be imported by frontend code.

If login still fails with *"Please verify your email"*: go to **Authentication →
Users**, click the user, and tick **Email Confirmed**.

---

# PART 4 — Daily workflow

**Terminal 1 — backend**
```bash
cd backend
npm run dev          # restarts automatically when you save a file
```

**Terminal 2 — frontend**
```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`.

**After every change:**
```bash
node diagnose-connection.mjs                              # is it connected?
cd backend && node practice/unit-tests.mjs                # is the logic correct?
cd backend && node ../smoke-test.mjs                      # do all endpoints work?
```

**When you change the database:** edit a NEW file
`database/migrations/002_something.sql`, paste it into the SQL Editor, then
re-run the checker. Never edit `001_advanced.sql` after it has been run —
people will already have your database in that state and your edit will not
apply.

---

# Quick reference

| I want to... | Do this |
|--------------|---------|
| Find out what is broken | `node diagnose-connection.mjs` |
| Change the database | New file in `database/migrations/`, paste into Supabase → SQL Editor → Run |
| See the real server error | Backend terminal (the terminal running `npm run dev`) |
| See what the browser sent | DevTools → Network → click the request |
| Check a table | Supabase → Table Editor → pick the table |
| Check a login | Supabase → Logs → Auth |
| Check the SQL | Supabase → Logs → API |
| Reset demo data | `node backend/practice/reset-demo-users.mjs` then `node backend/practice/seed-demo.mjs` |
| Test logic without a database | `cd backend && node practice/unit-tests.mjs` |
| Practise finding bugs | `cd backend && node practice/lab.mjs` |
