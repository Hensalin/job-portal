# Job Portal

Training project: React (Vite) frontend, Node/Express backend, Supabase (Postgres + Auth).

Two roles:
- **Job seeker**: browse/search jobs, apply, track application status.
- **Employer**: post jobs, delete jobs, view applicants, accept/reject.

## 1. Supabase setup
1. Create a project at https://supabase.com.
2. SQL Editor: run `database/schema.sql`, then `database/policies.sql`, then (optional) `database/seed.sql`.
3. Project Settings > API: copy the **Project URL** and the **service_role** key (backend only, never put it in the frontend).

## 2. Backend
```bash
cd backend
npm install
cp .env.example .env    # or edit .env directly, then fill in the values
npm run dev             # http://localhost:5000
```

## 3. Frontend
```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

## 4. Test the API
Import `postman/Job-Portal.json` into Postman. Run Login first; the token is saved automatically.

## API summary
| Method | Path | Access |
|---|---|---|
| POST | /api/auth/register | public |
| POST | /api/auth/login | public |
| GET | /api/auth/me | logged in |
| GET | /api/jobs?search=&type= | public |
| GET | /api/jobs/:id | public |
| GET | /api/jobs/mine/list | employer |
| POST | /api/jobs | employer |
| PUT | /api/jobs/:id | employer (owner) |
| DELETE | /api/jobs/:id | employer (owner) |
| POST | /api/applications | job seeker |
| GET | /api/applications/mine | job seeker |
| GET | /api/applications/job/:jobId | employer (owner) |
| PATCH | /api/applications/:id/status | employer (owner) |
