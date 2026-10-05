-- =============================================================
-- job-portal migration 001 - advanced features
-- NON-DESTRUCTIVE: uses ADD COLUMN IF NOT EXISTS / DROP IF EXISTS
-- so the existing working app keeps working.
--
-- HOW TO RUN:
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--   (or: psql "$DATABASE_URL" -f database/migrations/001_advanced.sql)
-- =============================================================

-- ---------- 1. profiles: admin role + full profile fields ----------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('seeker','employer','admin'));

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists headline text;
alter table profiles add column if not exists about text;
alter table profiles add column if not exists location text;
-- NOTE: the column is called current_title, NOT current_role.
-- "current_role" is a RESERVED WORD in PostgreSQL, so
--   alter table ... add column current_role text
-- fails with: ERROR: 42601 syntax error at or near "current_role"
alter table profiles add column if not exists current_title text;
alter table profiles add column if not exists years_experience int;
alter table profiles add column if not exists skills text[] default '{}';
alter table profiles add column if not exists languages text[] default '{}';
alter table profiles add column if not exists portfolio text;
alter table profiles add column if not exists linkedin text;
alter table profiles add column if not exists github text;
alter table profiles add column if not exists website text;
alter table profiles add column if not exists expected_salary text;
alter table profiles add column if not exists preferred_job_type text;
alter table profiles add column if not exists preferred_location text;
alter table profiles add column if not exists remote_preference boolean default false;
alter table profiles add column if not exists notice_period text;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists email_verified boolean default false;
alter table profiles add column if not exists is_active boolean default true;
alter table profiles add column if not exists updated_at timestamptz default now();

create index if not exists idx_profiles_role on profiles(role);

-- ---------- 2. companies ----------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  logo_url text,
  industry text,
  size text check (size in ('1-10','11-50','51-200','201-500','501-1000','1000+')),
  founded_year int,
  website text,
  email text,
  phone text,
  location text,
  about text,
  culture text,
  benefits text[] default '{}',
  social_links jsonb default '{}',
  is_verified boolean default false,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_companies_owner on companies(owner_id);
create index if not exists idx_companies_name on companies(name);
create unique index if not exists uq_companies_owner on companies(owner_id);

-- ---------- 3. jobs: advanced fields ----------
alter table jobs drop constraint if exists jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('Full-time','Part-time','Internship','Contract','Freelance','Temporary','Remote'));

alter table jobs add column if not exists company_id uuid references companies(id) on delete set null;
alter table jobs add column if not exists department text;
alter table jobs add column if not exists work_mode text check (work_mode in ('On-site','Hybrid','Remote'));
alter table jobs add column if not exists experience_level text
  check (experience_level in ('Fresher','0-1 years','1-3 years','3-5 years','5-10 years','10+ years'));
alter table jobs add column if not exists openings int default 1;
alter table jobs add column if not exists country text default 'India';
alter table jobs add column if not exists state text;
alter table jobs add column if not exists city text;
alter table jobs add column if not exists office_address text;
alter table jobs add column if not exists remote_scope text
  check (remote_scope in ('Remote','Remote within country','Worldwide remote'));
alter table jobs add column if not exists salary_min numeric;
alter table jobs add column if not exists salary_max numeric;
alter table jobs add column if not exists currency text default 'INR';
alter table jobs add column if not exists salary_period text
  check (salary_period in ('Per year','Per month','Per hour'));
alter table jobs add column if not exists hide_salary boolean default false;
alter table jobs add column if not exists overview text;
alter table jobs add column if not exists responsibilities text;
alter table jobs add column if not exists required_skills text[] default '{}';
alter table jobs add column if not exists preferred_skills text[] default '{}';
alter table jobs add column if not exists qualifications text;
alter table jobs add column if not exists experience_required text;
alter table jobs add column if not exists education_req text;
alter table jobs add column if not exists benefits text;
alter table jobs add column if not exists perks text;
alter table jobs add column if not exists work_environment text;
alter table jobs add column if not exists about_company text;
alter table jobs add column if not exists status text not null default 'active'
  check (status in ('draft','active','paused','closed'));
alter table jobs add column if not exists views int default 0;
alter table jobs add column if not exists published_at timestamptz;
alter table jobs add column if not exists closed_at timestamptz;
alter table jobs add column if not exists updated_at timestamptz default now();

create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_jobs_company on jobs(company_id);
create index if not exists idx_jobs_salary on jobs(salary_max);
create index if not exists idx_jobs_workmode on jobs(work_mode);
create index if not exists idx_jobs_created on jobs(created_at desc);

-- ---------- 4. job_skills (normalised for indexable skill filtering) ----------
create table if not exists job_skills (
  job_id uuid not null references jobs(id) on delete cascade,
  skill text not null,
  is_required boolean default true,
  primary key (job_id, skill)
);
create index if not exists idx_job_skills_skill on job_skills(skill);

-- ---------- 5. job_questions (custom employer questions) ----------
create table if not exists job_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  question text not null,
  type text not null default 'text'
    check (type in ('text','textarea','boolean','select','number')),
  options text[] default '{}',
  is_required boolean default false,
  sort_order int default 0
);
create index if not exists idx_jobq_job on job_questions(job_id);

-- ---------- 6. resumes (created BEFORE applications because applications FKs it) ----------
create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text,
  mime_type text,
  size_bytes int,
  is_default boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_resumes_profile on resumes(profile_id);

-- ---------- 7. applications: full hiring pipeline ----------
-- STEP 7a: move existing rows onto the NEW status names FIRST.
--
-- This must happen BEFORE the constraint swap below. Postgres checks every
-- existing row when you ADD a CHECK constraint. Old values 'pending' and
-- 'accepted' are not in the new list, so without this the migration fails with:
--     ERROR: check constraint "applications_status_check" of relation
--            "applications" is violated by some row
-- Mapping: pending -> applied, accepted -> hired (closest honest equivalent).
alter table applications drop constraint if exists applications_status_check;
update applications set status = 'applied' where status = 'pending';
update applications set status = 'hired'   where status = 'accepted';

-- STEP 7b: now it is safe to install the new rule.
alter table applications add constraint applications_status_check
  check (status in ('applied','viewed','shortlisted','interview','assessment',
                    'offer','hired','rejected','withdrawn'));

alter table applications add column if not exists resume_id uuid references resumes(id) on delete set null;
alter table applications add column if not exists resume_url text;
alter table applications add column if not exists resume_name text;
alter table applications add column if not exists expected_salary text;
alter table applications add column if not exists notice_period text;
alter table applications add column if not exists current_location text;
alter table applications add column if not exists status_updated_at timestamptz default now();
alter table applications add column if not exists updated_at timestamptz default now();

create index if not exists idx_apps_status on applications(status);

-- ---------- 8. application_answers ----------
create table if not exists application_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  question_id uuid references job_questions(id) on delete set null,
  question text not null,
  answer text,
  created_at timestamptz default now()
);
create index if not exists idx_answers_app on application_answers(application_id);

-- ---------- 9. saved_jobs ----------
create table if not exists saved_jobs (
  profile_id uuid not null references profiles(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (profile_id, job_id)
);

-- ---------- 10. education / experience / certifications ----------
create table if not exists education (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  institution text not null,
  degree text,
  field_of_study text,
  start_year int, end_year int,
  grade text, description text,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_education_profile on education(profile_id);

create table if not exists experience (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  company text not null,
  title text not null,
  location text,
  start_date date, end_date date,
  is_current boolean default false,
  description text,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_experience_profile on experience(profile_id);

create table if not exists certifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null, issuer text,
  issued_on date, credential_url text,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_certs_profile on certifications(profile_id);

-- ---------- 11. notifications ----------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  is_read boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_notif_profile on notifications(profile_id, is_read);
create index if not exists idx_notif_created on notifications(created_at desc);

-- ---------- 12. interviews ----------
create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  type text not null default 'video' check (type in ('video','phone','in-person')),
  meeting_link text, location text, notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_interviews_app on interviews(application_id);

-- ---------- 13. recruiter_notes (PRIVATE - never exposed to the candidate) ----------
create table if not exists recruiter_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  note text not null,
  created_at timestamptz default now()
);
create index if not exists idx_notes_app on recruiter_notes(application_id);

-- ---------- 14. job_alerts ----------
create table if not exists job_alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  keyword text, location text,
  experience_level text, remote_only boolean default false,
  job_type text,
  frequency text not null default 'daily' check (frequency in ('daily','weekly')),
  is_active boolean default true,
  last_sent_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_alerts_profile on job_alerts(profile_id);

-- ---------- 15. job_reports ----------
create table if not exists job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz default now()
);
create index if not exists idx_reports_status on job_reports(status);

-- ---------- 16. RLS on the new tables ----------
alter table companies enable row level security;
alter table job_skills enable row level security;
alter table job_questions enable row level security;
alter table application_answers enable row level security;
alter table saved_jobs enable row level security;
alter table resumes enable row level security;
alter table education enable row level security;
alter table experience enable row level security;
alter table certifications enable row level security;
alter table notifications enable row level security;
alter table interviews enable row level security;
alter table recruiter_notes enable row level security;
alter table job_alerts enable row level security;
alter table job_reports enable row level security;

drop policy if exists "own saved jobs" on saved_jobs;
create policy "own saved jobs" on saved_jobs for all
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists "own notifications" on notifications;
create policy "own notifications" on notifications for select
  using (auth.uid() = profile_id);
drop policy if exists "own notifications update" on notifications;
create policy "own notifications update" on notifications for update
  using (auth.uid() = profile_id);

drop policy if exists "anyone reads jobs" on job_skills;
create policy "anyone reads job skills" on job_skills for select using (true);
drop policy if exists "anyone reads questions" on job_questions;
create policy "anyone reads job questions" on job_questions for select using (true);
drop policy if exists "anyone reads companies" on companies;
create policy "anyone reads approved companies" on companies for select
  using (status = 'approved' or auth.uid() = owner_id);
drop policy if exists "owner manages company" on companies;
create policy "owner manages company" on companies for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "logged in can report" on job_reports;
create policy "logged in can report" on job_reports for insert
  with check (auth.uid() = reporter_id);
drop policy if exists "reporter reads own reports" on job_reports;
create policy "reporter reads own reports" on job_reports for select
  using (auth.uid() = reporter_id);

-- ---------- 17. private storage bucket for resumes ----------
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "own resumes read" on storage.objects;
create policy "own resumes read" on storage.objects for select
  using (bucket_id = 'resumes' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "own resumes upload" on storage.objects;
create policy "own resumes upload" on storage.objects for insert
  with check (bucket_id = 'resumes' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "own resumes delete" on storage.objects;
create policy "own resumes delete" on storage.objects for delete
  using (bucket_id = 'resumes' and auth.uid()::text = (storage.foldername(name))[1]);