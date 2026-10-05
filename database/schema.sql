-- Job Portal schema (run in Supabase SQL Editor)

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('seeker', 'employer')),
  created_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  company text not null,
  location text not null,
  type text not null default 'Full-time'
    check (type in ('Full-time', 'Part-time', 'Internship', 'Contract', 'Remote')),
  salary text,
  description text not null,
  created_at timestamptz default now()
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  applicant_id uuid not null references profiles(id) on delete cascade,
  cover_letter text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now(),
  unique (job_id, applicant_id)
);

create index if not exists idx_jobs_employer on jobs(employer_id);
create index if not exists idx_apps_job on applications(job_id);
create index if not exists idx_apps_applicant on applications(applicant_id);
