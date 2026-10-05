import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { validateText } from '../utils/validators.js';
import { scoreJob } from '../utils/match.js';

export const JOB_TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract', 'Freelance', 'Temporary', 'Remote'];
export const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];
export const EXPERIENCE_LEVELS = ['Fresher', '0-1 years', '1-3 years', '3-5 years', '5-10 years', '10+ years'];
export const SALARY_PERIODS = ['Per year', 'Per month', 'Per hour'];
export const REMOTE_SCOPES = ['Remote', 'Remote within country', 'Worldwide remote'];
export const JOB_STATUSES = ['draft', 'active', 'paused', 'closed'];
export const SORTS = ['relevance', 'newest', 'salary_high', 'salary_low'];

const SECTION_FIELDS = [
  'overview', 'responsibilities', 'required_skills', 'preferred_skills',
  'qualifications', 'experience_required', 'education_req', 'benefits',
  'perks', 'work_environment', 'about_company',
];

const asArray = (v) =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 60)
    : typeof v === 'string'
      ? v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 60)
      : [];

/**
 * Escapes a user term for use inside a PostgREST .or() filter.
 * , ( ) are structural and % _ are LIKE wildcards - all must be neutralised
 * or a user can inject filter conditions / wildcard-match everything.
 */
export function sanitizeSearch(term) {
  return String(term ?? '')
    .replace(/[,()]/g, ' ')
    .replace(/[%_]/g, ' ')          // LIKE wildcards
    .replace(/[.*+?^${}|[\]\\]/g, ' ') // regex-ish chars PostgREST may read
    .trim()
    .slice(0, 80);
}

// ------------------------------------------------------------------ shaping

export function shapeJob(row, { withSections = false } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    employerId: row.employer_id,
    companyId: row.company_id,
    title: row.title,
    company: row.company,
    department: row.department,
    // `location` is the legacy single-line column the old code used; keep it
    // populated so the old frontend keeps working.
    location: row.location || [row.city, row.state].filter(Boolean).join(', ') || row.country || '',
    city: row.city,
    state: row.state,
    country: row.country,
    officeAddress: row.office_address,
    remoteScope: row.remote_scope,
    type: row.type,
    workMode: row.work_mode,
    experienceLevel: row.experience_level,
    openings: row.openings ?? 1,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.currency || 'INR',
    salaryPeriod: row.salary_period,
    hideSalary: row.hide_salary ?? false,
    description: row.description,
    requiredSkills: row.required_skills || [],
    preferredSkills: row.preferred_skills || [],
    status: row.status || 'active',
    views: row.views ?? 0,
    createdAt: row.created_at,
    publishedAt: row.published_at || row.created_at,
    closedAt: row.closed_at,
    companyRef: row.companies
      ? {
          id: row.companies.id,
          name: row.companies.name,
          logoUrl: row.companies.logo_url,
          industry: row.companies.industry,
          size: row.companies.size,
          location: row.companies.location,
          isVerified: row.companies.is_verified,
        }
      : undefined,
    applicationsCount: row.applications?.[0]?.count ?? undefined,
    isSaved: row.is_saved ?? undefined,
  };
  // duplicate key guard: the legacy column and the nested company both map to
  // `company`. Prefer the nested object when present.
  if (base.companyRef?.name) base.company = base.companyRef.name;

  if (withSections) {
    for (const f of SECTION_FIELDS) base[f] = row[f] ?? null;
  }
  return base;
}

// ------------------------------------------------------------------ listing

/**
 * Public job search: filters, sorting, pagination.
 * Only status='active' is ever visible to anonymous / seeker callers.
 */
export async function listJobs(query = {}, { viewerId = null } = {}) {
  const {
    search, type, work_mode: workMode, experience_level: experience,
    city, state, country, company_id: companyId, skill,
    salary_min: salaryMin, salary_max: salaryMax,
    date_posted: datePosted, sort = 'newest',
    page = 1, limit = 20, status: statusFilter,
  } = query;

  const perPage = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const currentPage = Math.max(Number(page) || 1, 1);
  const from = (currentPage - 1) * perPage;

  let q = supabase.from('jobs').select('*, companies(id, name, logo_url, industry, size, location, is_verified)', { count: 'exact' });

  // Employers/admins can filter by status; everyone else only sees active.
  q = statusFilter && JOB_STATUSES.includes(statusFilter) ? q.eq('status', statusFilter) : q.eq('status', 'active');

  if (type) q = q.in('type', String(type).split(','));
  if (workMode) q = q.in('work_mode', String(workMode).split(','));
  if (experience) q = q.in('experience_level', String(experience).split(','));
  if (city) q = q.ilike('city', `%${sanitizeSearch(city)}%`);
  if (state) q = q.ilike('state', `%${sanitizeSearch(state)}%`);
  if (country) q = q.ilike('country', `%${sanitizeSearch(country)}%`);
  if (companyId) q = q.eq('company_id', companyId);
  if (salaryMin) q = q.gte('salary_max', Number(salaryMin));
  if (salaryMax) q = q.lte('salary_min', Number(salaryMax));

  if (datePosted) {
    const days = Math.min(Number(datePosted) || 1, 365);
    q = q.gte('created_at', new Date(Date.now() - days * 864e5).toISOString());
  }

  if (search) {
    const s = sanitizeSearch(search);
    if (s) q = q.or(`title.ilike.%${s}%,company.ilike.%${s}%,description.ilike.%${s}%,department.ilike.%${s}%`);
  }

  switch (sort) {
    case 'salary_high': q = q.order('salary_max', { ascending: false, nullsFirst: false }); break;
    case 'salary_low': q = q.order('salary_min', { ascending: true, nullsFirst: false }); break;
    case 'relevance': q = q.order('created_at', { ascending: false }); break; // no tsvector yet
    default: q = q.order('created_at', { ascending: false });
  }

  q = q.range(from, from + perPage - 1);

  const { data, error, count } = await q;
  if (error) throw ApiError.internal(error.message);

  let jobs = data || [];

  // Skill filter: job_skills is normalised so this is indexable.
  if (skill) {
    const wanted = String(skill).split(',').map((s) => s.trim()).filter(Boolean);
    const { data: rows } = await supabase.from('job_skills').select('job_id, skill').in('skill', wanted);
    const ids = new Set((rows || []).map((r) => r.job_id));
    jobs = jobs.filter((j) => ids.has(j.id));
  }

  // Mark which of these the viewer has saved (one extra query, not an N+1).
  if (viewerId && jobs.length) {
    const { data: saved } = await supabase
      .from('saved_jobs').select('job_id').eq('profile_id', viewerId).in('job_id', jobs.map((j) => j.id));
    const savedIds = new Set((saved || []).map((r) => r.job_id));
    jobs = jobs.map((j) => ({ ...j, is_saved: savedIds.has(j.id) }));
  }

  return {
    jobs: jobs.map((j) => shapeJob(j)),
    pagination: {
      page: currentPage,
      limit: perPage,
      total: count ?? jobs.length,
      totalPages: Math.max(1, Math.ceil((count ?? jobs.length) / perPage)),
      hasMore: from + jobs.length < (count ?? 0),
    },
  };
}

/** Employer dashboard list: all their jobs regardless of status. */
export async function listJobsByEmployer(employerId, { status } = {}) {
  let q = supabase
    .from('jobs')
    .select('*, applications(count), companies(id, name, logo_url, industry, size, location, is_verified)', { count: 'exact' })
    .eq('employer_id', employerId)
    .order('created_at', { ascending: false });
  if (status && JOB_STATUSES.includes(status)) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw ApiError.internal(error.message);
  return (data || []).map((j) => shapeJob(j));
}

export async function getJob(id, { incrementViews = false } = {}) {
  const { data, error } = await supabase
    .from('jobs').select('*, companies(id, name, logo_url, industry, size, location, about, is_verified)')
    .eq('id', id).maybeSingle();
  if (error) throw ApiError.internal('Could not load that job.');
  if (!data) throw ApiError.notFound('Job not found.');

  if (incrementViews && data.status === 'active') {
    // fire and forget - a failed counter must never break the page
    supabase.from('jobs').update({ views: (data.views ?? 0) + 1 }).eq('id', id).then(() => {}, () => {});
    data.views = (data.views ?? 0) + 1;
  }
  return shapeJob(data, { withSections: true });
}

export async function getSimilarJobs(job, limit = 5) {
  let q = supabase
    .from('jobs').select('*, companies(id, name, logo_url, industry, size, location, is_verified)')
    .eq('status', 'active').neq('id', job.id).limit(limit);
  if (job.company_id) q = q.or(`company_id.eq.${job.company_id},type.eq.${job.type}`);
  else q = q.eq('type', job.type);

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((j) => shapeJob(j));
}

export async function getRecommendedJobs(profile, limit = 10) {
  const { data, error } = await supabase
    .from('jobs').select('*, companies(id, name, logo_url, industry, size, location, is_verified)')
    .eq('status', 'active').order('created_at', { ascending: false }).limit(60);
  if (error) throw ApiError.internal('Could not load recommendations.');

  const scored = (data || [])
    .map((j) => {
      const job = shapeJob(j);
      return { ...job, match: scoreJob(job, profile) };
    })
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);

  // Only surface things that actually matched something.
  return scored.filter((j) => j.match.score > 0);
}

// ------------------------------------------------------------------ writes

function validateJobPayload(body, { partial = false } = {}) {
  const out = {};
  const errors = {};

  const required = (field, label, max = 200) => {
    if (partial && body[field] === undefined) return;
    const r = validateText(body[field], { label, min: 2, max });
    if (!r.ok) errors[field] = r.error; else out[field] = r.value;
  };

  required('title', 'Job title');
  required('description', 'Job description', 8000);

  // company comes from the employer's company profile when possible
  if (body.company !== undefined) {
    const r = validateText(body.company, { label: 'Company', min: 2, max: 120 });
    if (!r.ok) errors.company = r.error; else out.company = r.value;
  }
  if (body.location !== undefined) {
    const r = validateText(body.location, { label: 'Location', required: false, max: 200 });
    if (!r.ok) errors.location = r.error; else out.location = r.value;
  }
  if (body.department !== undefined) {
    const r = validateText(body.department, { label: 'Department', required: false, max: 100 });
    if (!r.ok) errors.department = r.error; else out.department = r.value;
  }

  const choice = (field, label, allowed) => {
    if (body[field] === undefined) {
      if (!partial && ['type'].includes(field)) errors[field] = `${label} is required.`;
      return;
    }
    if (!body[field]) return;
    if (!allowed.includes(body[field])) errors[field] = `Choose a valid ${label.toLowerCase()}.`;
    else out[field] = body[field];
  };
  choice('type', 'Employment type', JOB_TYPES);
  choice('work_mode', 'Work mode', WORK_MODES);
  choice('experience_level', 'Experience level', EXPERIENCE_LEVELS);
  choice('salary_period', 'Salary period', SALARY_PERIODS);
  choice('remote_scope', 'Remote scope', REMOTE_SCOPES);
  choice('status', 'Status', JOB_STATUSES);

  if (body.openings !== undefined) {
    const n = Number(body.openings);
    if (!Number.isInteger(n) || n < 1 || n > 999) errors.openings = 'Enter between 1 and 999 openings.';
    else out.openings = n;
  }
  if (body.hide_salary !== undefined) out.hide_salary = !!body.hide_salary;

  // ---- salary: min must be <= max ----
  const min = body.salary_min === '' || body.salary_min == null ? null : Number(body.salary_min);
  const max = body.salary_max === '' || body.salary_max == null ? null : Number(body.salary_max);
  if (min !== null && (!Number.isFinite(min) || min < 0))
    errors.salary_min = 'Minimum salary must be a positive number.';
  if (max !== null && (!Number.isFinite(max) || max < 0))
    errors.salary_max = 'Maximum salary must be a positive number.';
  if (min !== null && max !== null && min > max)
    errors.salary_max = 'Maximum salary must be greater than the minimum.';
  if (!partial && (min === null || max === null) && !body.hide_salary)
    errors.salary_max = 'Provide a salary range, or tick "Hide salary".';
  if (body.salary_min !== undefined) out.salary_min = min;
  if (body.salary_max !== undefined) out.salary_max = max;

  for (const f of ['city', 'state', 'country', 'office_address']) {
    if (body[f] === undefined) continue;
    const r = validateText(body[f], { label: f.replace(/_/g, ' '), required: false, max: 200 });
    if (!r.ok) errors[f] = r.error; else out[f] = r.value;
  }

  for (const f of SECTION_FIELDS) {
    if (body[f] === undefined) continue;
    if (f.endsWith('_skills')) out[f] = asArray(body[f]);
    else {
      const r = validateText(body[f], { label: f.replace(/_/g, ' '), required: false, max: 8000 });
      if (!r.ok) errors[f] = r.error; else out[f] = r.value;
    }
  }

  if (Object.keys(errors).length) throw ApiError.badRequest(Object.values(errors)[0], errors);
  return out;
}

export async function createJob(employerId, body, companyId) {
  const data = validateJobPayload(body);

  // Fall back to the company profile so the employer does not retype it.
  if (!data.company && companyId) {
    const { data: c } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle();
    if (c?.name) data.company = c.name;
  }
  if (!data.company) throw ApiError.badRequest('Company is required.', { company: 'Company is required.' });
  if (!data.city && !data.location && !data.country)
    throw ApiError.badRequest('Location is required.', { city: 'Location is required.' });

  const now = new Date().toISOString();
  const status = data.status || 'active';

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      employer_id: employerId,
      company_id: companyId ?? null,
      title: data.title,
      company: data.company,
      location: data.location || [data.city, data.state].filter(Boolean).join(', ') || data.country,
      department: data.department ?? null,
      type: data.type,
      work_mode: data.work_mode ?? null,
      experience_level: data.experience_level ?? null,
      openings: data.openings ?? 1,
      country: data.country ?? 'India',
      state: data.state ?? null,
      city: data.city ?? null,
      office_address: data.office_address ?? null,
      remote_scope: data.remote_scope ?? null,
      salary_min: data.salary_min ?? null,
      salary_max: data.salary_max ?? null,
      currency: body.currency || 'INR',
      salary_period: data.salary_period ?? null,
      hide_salary: data.hide_salary ?? false,
      description: data.description,
      overview: data.overview ?? null,
      responsibilities: data.responsibilities ?? null,
      required_skills: data.required_skills ?? [],
      preferred_skills: data.preferred_skills ?? [],
      qualifications: data.qualifications ?? null,
      experience_required: data.experience_required ?? null,
      education_req: data.education_req ?? null,
      benefits: data.benefits ?? null,
      perks: data.perks ?? null,
      work_environment: data.work_environment ?? null,
      about_company: data.about_company ?? null,
      status,
      published_at: status === 'active' ? now : null,
    })
    .select('*, companies(id, name, logo_url, industry, size, location, is_verified)')
    .single();

  if (error) throw ApiError.internal(error.message);

  // Normalised skill rows for indexable filtering.
  const skills = [...new Set([...(data.required_skills || []), ...(data.preferred_skills || [])])];
  if (skills.length) {
    await supabase.from('job_skills').upsert(
      skills.map((skill) => ({ job_id: job.id, skill, is_required: (data.required_skills || []).includes(skill) })),
      { onConflict: 'job_id,skill' }
    );
  }
  if (Array.isArray(body.questions)) await replaceQuestions(job.id, body.questions);

  return shapeJob(job);
}

export async function updateJob(jobId, employerId, body) {
  const existing = await assertOwnership(jobId, employerId);
  const data = validateJobPayload(body, { partial: true });

  const patch = { updated_at: new Date().toISOString() };
  const map = {
    title: 'title', company: 'company', location: 'location', department: 'department',
    type: 'type', work_mode: 'work_mode', experience_level: 'experience_level',
    openings: 'openings', country: 'country', state: 'state', city: 'city',
    office_address: 'office_address', remote_scope: 'remote_scope',
    salary_min: 'salary_min', salary_max: 'salary_max', salary_period: 'salary_period',
    hide_salary: 'hide_salary', description: 'description', overview: 'overview',
    responsibilities: 'responsibilities', required_skills: 'required_skills',
    preferred_skills: 'preferred_skills', qualifications: 'qualifications',
    experience_required: 'experience_required', education_req: 'education_req',
    benefits: 'benefits', perks: 'perks', work_environment: 'work_environment',
    about_company: 'about_company',
  };
  for (const [key, col] of Object.entries(map)) if (data[key] !== undefined) patch[col] = data[key];

  // status transitions need the timestamp columns kept in sync
  if (data.status && data.status !== existing.status) {
    patch.status = data.status;
    if (data.status === 'active' && !existing.published_at) patch.published_at = new Date().toISOString();
    if (data.status === 'closed') patch.closed_at = new Date().toISOString();
  }
  if (data.location === undefined && (data.city || data.state))
    patch.location = [data.city ?? existing.city, data.state ?? existing.state].filter(Boolean).join(', ');

  const { data: job, error } = await supabase
    .from('jobs').update(patch).eq('id', jobId)
    .select('*, companies(id, name, logo_url, industry, size, location, is_verified)').single();
  if (error) throw ApiError.internal(error.message);

  if (data.required_skills || data.preferred_skills) {
    await supabase.from('job_skills').delete().eq('job_id', jobId);
    const req = data.required_skills || existing.required_skills || [];
    const pref = data.preferred_skills || existing.preferred_skills || [];
    const skills = [...new Set([...req, ...pref])];
    if (skills.length) {
      await supabase.from('job_skills').upsert(
        skills.map((skill) => ({ job_id: jobId, skill, is_required: req.includes(skill) })),
        { onConflict: 'job_id,skill' }
      );
    }
  }
  if (Array.isArray(body.questions)) await replaceQuestions(jobId, body.questions);

  return shapeJob(job);
}

/** The single ownership gate for every job mutation. */
export async function assertOwnership(jobId, employerId) {
  const { data: job, error } = await supabase
    .from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw ApiError.internal('Could not load that job.');
  if (!job) throw ApiError.notFound('Job not found.');
  if (job.employer_id !== employerId) throw ApiError.forbidden('You can only change your own jobs.');
  return job;
}

export async function setStatus(jobId, employerId, status) {
  if (!JOB_STATUSES.includes(status)) throw ApiError.badRequest('Invalid job status.');
  await assertOwnership(jobId, employerId);
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'active') patch.published_at = new Date().toISOString();
  if (status === 'closed') patch.closed_at = new Date().toISOString();
  const { data, error } = await supabase.from('jobs').update(patch).eq('id', jobId).select().single();
  if (error) throw ApiError.internal(error.message);
  return shapeJob(data);
}

export async function deleteJob(jobId, employerId) {
  await assertOwnership(jobId, employerId);
  const { error } = await supabase.from('jobs').delete().eq('id', jobId);
  if (error) throw ApiError.internal(error.message);
  return { message: 'Job deleted.' };
}

export async function duplicateJob(jobId, employerId, companyId) {
  const job = await assertOwnership(jobId, employerId);
  return createJob(employerId, {
    title: `${job.title} (copy)`,
    description: job.description,
    company: job.company,
    location: job.location,
    type: job.type,
    work_mode: job.work_mode,
    experience_level: job.experience_level,
    openings: job.openings,
    country: job.country, state: job.state, city: job.city,
    salary_min: job.salary_min, salary_max: job.salary_max,
    salary_period: job.salary_period, hide_salary: job.hide_salary,
    overview: job.overview, responsibilities: job.responsibilities,
    required_skills: job.required_skills, preferred_skills: job.preferred_skills,
    qualifications: job.qualifications, experience_required: job.experience_required,
    education_req: job.education_req, benefits: job.benefits, perks: job.perks,
    work_environment: job.work_environment, about_company: job.about_company,
    status: 'draft',
  }, companyId ?? job.company_id);
}

// ------------------------------------------------------------------ questions

const QUESTION_TYPES = ['text', 'textarea', 'boolean', 'select', 'number'];

export async function getQuestions(jobId) {
  const { data, error } = await supabase
    .from('job_questions').select('*').eq('job_id', jobId).order('sort_order');
  if (error) throw ApiError.internal('Could not load the application form.');
  return (data || []).map((q) => ({
    id: q.id,
    question: q.question,
    type: q.type,
    options: q.options || [],
    isRequired: q.is_required,
    sortOrder: q.sort_order,
  }));
}

async function replaceQuestions(jobId, questions) {
  if (!Array.isArray(questions)) return;
  await supabase.from('job_questions').delete().eq('job_id', jobId);
  const rows = questions.slice(0, 20).map((q, i) => {
    const text = validateText(q.question, { label: `Question ${i + 1}`, min: 3, max: 300 });
    if (!text.ok) throw ApiError.badRequest(text.error, { questions: text.error });
    const type = QUESTION_TYPES.includes(q.type) ? q.type : 'text';
    return {
      job_id: jobId,
      question: text.value,
      type,
      options: type === 'select' ? asArray(q.options).slice(0, 12) : [],
      is_required: !!q.is_required,
      sort_order: i,
    };
  });
  if (rows.length) {
    const { error } = await supabase.from('job_questions').insert(rows);
    if (error) throw ApiError.internal(error.message);
  }
}

// ------------------------------------------------------------------ reports

const REPORT_REASONS = ['fake_job', 'scam', 'wrong_information', 'duplicate', 'offensive', 'other'];

export async function reportJob({ jobId, reporterId, reason, details }) {
  if (!REPORT_REASONS.includes(reason)) throw ApiError.badRequest('Choose a valid reason.');
  const { data: job } = await supabase.from('jobs').select('id, title').eq('id', jobId).maybeSingle();
  if (!job) throw ApiError.notFound('Job not found.');

  const { data, error } = await supabase
    .from('job_reports')
    .insert({ job_id: jobId, reporter_id: reporterId, reason, details: details ? String(details).slice(0, 1000) : null })
    .select().single();
  if (error) {
    if (error.code === '23505') throw ApiError.conflict('You have already reported this job.');
    throw ApiError.internal(error.message);
  }
  return { id: data.id, message: 'Thanks. Our team will review this job.' };
}

export { SECTION_FIELDS, asArray };