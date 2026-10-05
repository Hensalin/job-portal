-- Sample jobs. First register an employer account in the app, then run:
-- insert into jobs (employer_id, title, company, location, type, salary, description)
-- select id, 'Frontend Developer', 'Acme Tech', 'Chennai', 'Full-time', '6-9 LPA',
--   'Build React interfaces for our hiring products.'
-- from profiles where role = 'employer' limit 1;

insert into jobs (employer_id, title, company, location, type, salary, description)
select id, t.title, t.company, t.location, t.type, t.salary, t.description
from profiles,
(values
  ('Frontend Developer', 'Acme Tech', 'Chennai', 'Full-time', '6-9 LPA', 'Build React interfaces for our hiring products.'),
  ('Node.js Intern', 'Startup Labs', 'Remote', 'Internship', '15k/month', 'Work with our backend team on REST APIs.'),
  ('QA Engineer', 'Quality First', 'Bengaluru', 'Contract', '5-7 LPA', 'Write and run test plans for web applications.')
) as t(title, company, location, type, salary, description)
where profiles.role = 'employer'
limit 3;
