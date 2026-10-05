-- Row Level Security. The backend uses the service_role key (bypasses RLS);
-- these policies protect the tables if they are ever accessed directly.

alter table profiles enable row level security;
alter table jobs enable row level security;
alter table applications enable row level security;

-- profiles
create policy "Users read own profile" on profiles
  for select using (auth.uid() = id);

-- jobs: anyone can read, only the owning employer can write
create policy "Anyone can read jobs" on jobs
  for select using (true);
create policy "Employers insert own jobs" on jobs
  for insert with check (auth.uid() = employer_id);
create policy "Employers update own jobs" on jobs
  for update using (auth.uid() = employer_id);
create policy "Employers delete own jobs" on jobs
  for delete using (auth.uid() = employer_id);

-- applications
create policy "Seekers read own applications" on applications
  for select using (auth.uid() = applicant_id);
create policy "Seekers apply" on applications
  for insert with check (auth.uid() = applicant_id);
create policy "Employers read applications for their jobs" on applications
  for select using (
    exists (select 1 from jobs j where j.id = applications.job_id and j.employer_id = auth.uid())
  );
create policy "Employers update applications for their jobs" on applications
  for update using (
    exists (select 1 from jobs j where j.id = applications.job_id and j.employer_id = auth.uid())
  );
