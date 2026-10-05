import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { validateText, validateUrl, validateYear } from '../utils/validators.js';

/** Fields a seeker is allowed to edit. employer_id etc. are never touchable. */
const EDITABLE = [
  'full_name', 'phone', 'headline', 'about', 'location', 'current_title',
  'years_experience', 'skills', 'languages', 'portfolio', 'linkedin', 'github',
  'website', 'expected_salary', 'preferred_job_type', 'preferred_location',
  'remote_preference', 'notice_period', 'avatar_url',
];

const asArray = (v) =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 50)
    : typeof v === 'string'
      ? v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50)
      : null;

export async function getProfile(userId) {
  const { data: profile, error } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw ApiError.internal('Could not load your profile.');
  if (!profile) throw ApiError.notFound('Profile not found.');

  const [company, resumes, education, experience, certifications, savedCount] = await Promise.all([
    supabase.from('companies').select('*').eq('owner_id', userId).maybeSingle(),
    supabase.from('resumes').select('*').eq('profile_id', userId).order('created_at', { ascending: false }),
    supabase.from('education').select('*').eq('profile_id', userId).order('sort_order'),
    supabase.from('experience').select('*').eq('profile_id', userId).order('sort_order'),
    supabase.from('certifications').select('*').eq('profile_id', userId).order('sort_order'),
    supabase.from('saved_jobs').select('job_id', { count: 'exact', head: true }).eq('profile_id', userId),
  ]);

  // Public shape. NOTE: email is NOT here - it lives in auth.users, and the
  // controller merges in req.user.email so we never store it twice.
  const publicProfile = {
    id: profile.id,
    fullName: profile.full_name,
    phone: profile.phone,
    headline: profile.headline,
    about: profile.about,
    location: profile.location,
    currentRole: profile.current_title,
    yearsExperience: profile.years_experience,
    skills: profile.skills || [],
    languages: profile.languages || [],
    portfolio: profile.portfolio,
    linkedin: profile.linkedin,
    github: profile.github,
    website: profile.website,
    expectedSalary: profile.expected_salary,
    preferredJobType: profile.preferred_job_type,
    preferredLocation: profile.preferred_location,
    remotePreference: profile.remote_preference ?? false,
    noticePeriod: profile.notice_period,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    createdAt: profile.created_at,
  };

  return {
    ...publicProfile,
    company: company.data || null,
    resumes: resumes.data || [],
    education: education.data || [],
    experience: experience.data || [],
    certifications: certifications.data || [],
    savedJobsCount: savedCount.count || 0,
    completion: profileCompletion(profile, resumes.data || [], education.data || [], experience.data || [], company.data),
  };
}

/**
 * Completion is calculated from real rows - not a hardcoded percentage.
 * Weight: basics 40, resume 20, skills 10, experience 15, education 10, extra 5.
 */
export function profileCompletion(profile, resumes, education, experience, company) {
  const has = (v) => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined && String(v).trim() !== '';
  };
  const checks = [
    { key: 'basics', weight: 40, done: has(profile.full_name) && has(profile.phone) && has(profile.location) },
    { key: 'resume', weight: 20, done: resumes.length > 0 },
    { key: 'skills', weight: 10, done: has(profile.skills) },
    { key: 'experience', weight: 15, done: experience.length > 0 || has(profile.current_title) },
    { key: 'education', weight: 10, done: education.length > 0 },
    { key: 'extras', weight: 5, done: !!company || has(profile.headline) || has(profile.about) },
  ];
  const percent = Math.round(checks.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0));
  const missing = checks.filter((c) => !c.done).map((c) => c.key);
  return { percent, missing };
}

export async function updateProfile(userId, body) {
  const patch = {};
  const errors = {};
  const set = (field, result) => {
    if (!result.ok) errors[field] = result.error;
    else patch[field] = result.value;
  };

  const map = {
    full_name: ['Full name', validateText, { min: 2, max: 80 }],
    phone: ['Phone', (v) => validateText(v, { label: 'Phone', min: 7, max: 20 })],
    headline: ['Headline', validateText, { required: false, max: 120 }],
    about: ['About', validateText, { required: false, max: 3000 }],
    location: ['Location', validateText, { required: false, max: 120 }],
    current_title: ['Current job title', validateText, { required: false, max: 120 }],
    portfolio: ['Portfolio link', (v) => validateUrl(v, 'Portfolio'), { optional: true }],
    linkedin: ['LinkedIn', (v) => validateUrl(v, 'LinkedIn'), { optional: true }],
    github: ['GitHub', (v) => validateUrl(v, 'GitHub'), { optional: true }],
    website: ['Website', (v) => validateUrl(v, 'Website'), { optional: true }],
    expected_salary: ['Expected salary', validateText, { required: false, max: 60 }],
    preferred_job_type: ['Preferred job type', validateText, { required: false, max: 40 }],
    preferred_location: ['Preferred location', validateText, { required: false, max: 120 }],
    notice_period: ['Notice period', validateText, { required: false, max: 60 }],
  };

  for (const [field, [label, validator, opts = {}]] of Object.entries(map)) {
    if (body[field] === undefined) continue;
    if (opts.optional && !body[field]) { patch[field] = null; continue; }
    set(field, validator(body[field], { label, required: opts.required !== false, min: opts.min, max: opts.max }));
  }

  if (body.years_experience !== undefined) {
    const n = Number(body.years_experience);
    if (!Number.isFinite(n) || n < 0 || n > 60) errors.years_experience = 'Enter a valid number of years.';
    else patch.years_experience = Math.round(n * 10) / 10;
  }
  if (body.remote_preference !== undefined) patch.remote_preference = !!body.remote_preference;
  if (body.skills !== undefined) patch.skills = asArray(body.skills) || [];
  if (body.languages !== undefined) patch.languages = asArray(body.languages) || [];
  if (body.avatar_url !== undefined) {
    const r = validateUrl(body.avatar_url, 'Photo');
    if (!r.ok) errors.avatar_url = r.error; else patch.avatar_url = r.value;
  }

  if (Object.keys(errors).length) throw ApiError.badRequest(Object.values(errors)[0], errors);
  if (!Object.keys(patch).length) return getProfile(userId);

  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw ApiError.internal('Could not save your profile.');
  return getProfile(userId);
}

// ------------------------------------------------------------------ children

const CHILD_TABLES = {
  education: {
    table: 'education',
    required: ['institution'],
    fields: ['institution', 'degree', 'field_of_study', 'grade', 'description'],
    years: ['start_year', 'end_year'],
  },
  experience: {
    table: 'experience',
    required: ['company', 'title'],
    fields: ['company', 'title', 'location', 'description'],
    dates: ['start_date', 'end_date'],
  },
  certifications: {
    table: 'certifications',
    required: ['name'],
    fields: ['name', 'issuer'],
    dates: ['issued_on'],
    url: ['credential_url'],
  },
};

export async function listChildren(profileId, kind) {
  const cfg = CHILD_TABLES[kind];
  if (!cfg) throw ApiError.badRequest('Unknown profile section.');
  const { data, error } = await supabase
    .from(cfg.table).select('*').eq('profile_id', profileId).order('sort_order');
  if (error) throw ApiError.internal('Could not load that section.');
  return data;
}

export async function addChild(profileId, kind, body) {
  const cfg = CHILD_TABLES[kind];
  if (!cfg) throw ApiError.badRequest('Unknown profile section.');

  const row = { profile_id: profileId };
  for (const f of cfg.required) {
    const r = validateText(body[f], { label: f.replace(/_/g, ' '), min: 2, max: 150 });
    if (!r.ok) throw ApiError.badRequest(r.error, { [f]: r.error });
    row[f] = r.value;
  }
  for (const f of cfg.fields || []) {
    if (body[f] === undefined) continue;
    const r = validateText(body[f], { label: f.replace(/_/g, ' '), required: false, max: 3000 });
    if (!r.ok) throw ApiError.badRequest(r.error, { [f]: r.error });
    row[f] = r.value;
  }
  for (const f of cfg.years || []) {
    if (body[f] === undefined || body[f] === '') continue;
    const r = validateYear(body[f], { label: f.replace(/_/g, ' ') });
    if (!r.ok) throw ApiError.badRequest(r.error, { [f]: r.error });
    row[f] = r.value;
  }
  for (const f of cfg.dates || []) {
    if (!body[f]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body[f]))
      throw ApiError.badRequest('Use the format YYYY-MM-DD.', { [f]: 'Use YYYY-MM-DD.' });
    row[f] = body[f];
  }
  for (const f of cfg.url || []) {
    if (!body[f]) continue;
    const r = validateUrl(body[f], 'Link');
    if (!r.ok) throw ApiError.badRequest(r.error, { [f]: r.error });
    row[f] = r.value;
  }
  if (kind === 'experience') {
    row.is_current = !!body.is_current;
    if (row.is_current) row.end_date = null;
    if (row.start_date && row.end_date && row.end_date < row.start_date)
      throw ApiError.badRequest('End date cannot be before the start date.', { end_date: 'Must be after the start date.' });
  }

  const { data, error } = await supabase.from(cfg.table).insert(row).select().single();
  if (error) throw ApiError.internal('Could not save that entry.');
  return data;
}

export async function updateChild(profileId, kind, id, body) {
  const cfg = CHILD_TABLES[kind];
  if (!cfg) throw ApiError.badRequest('Unknown profile section.');

  const { data: existing } = await supabase
    .from(cfg.table).select('*').eq('id', id).eq('profile_id', profileId).maybeSingle();
  if (!existing) throw ApiError.notFound('Entry not found.');

  const row = {};
  for (const f of [...(cfg.fields || []), ...cfg.required]) {
    if (body[f] === undefined) continue;
    const r = validateText(body[f], { label: f.replace(/_/g, ' '), required: cfg.required.includes(f), max: 3000 });
    if (!r.ok) throw ApiError.badRequest(r.error, { [f]: r.error });
    row[f] = r.value;
  }
  for (const f of cfg.years || []) {
    if (body[f] === undefined) continue;
    const r = validateYear(body[f], { label: f.replace(/_/g, ' ') });
    if (!r.ok) throw ApiError.badRequest(r.error, { [f]: r.error });
    row[f] = r.value;
  }
  for (const f of cfg.dates || []) {
    if (body[f] === undefined) continue;
    if (body[f] && !/^\d{4}-\d{2}-\d{2}$/.test(body[f]))
      throw ApiError.badRequest('Use the format YYYY-MM-DD.', { [f]: 'Use YYYY-MM-DD.' });
    row[f] = body[f] || null;
  }
  if (kind === 'experience' && body.is_current !== undefined) {
    row.is_current = !!body.is_current;
    if (row.is_current) row.end_date = null;
  }

  const { data, error } = await supabase
    .from(cfg.table).update(row).eq('id', id).eq('profile_id', profileId).select().single();
  if (error) throw ApiError.internal('Could not update that entry.');
  return data;
}

export async function deleteChild(profileId, kind, id) {
  const cfg = CHILD_TABLES[kind];
  if (!cfg) throw ApiError.badRequest('Unknown profile section.');
  const { error } = await supabase.from(cfg.table).delete().eq('id', id).eq('profile_id', profileId);
  if (error) throw ApiError.internal('Could not delete that entry.');
}

/** Public profile an employer is allowed to see (no email/phone unless applied). */
export async function getPublicProfile(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, headline, about, location, current_title, years_experience, skills, languages, portfolio, linkedin, github, website, avatar_url, created_at')
    .eq('id', profileId).maybeSingle();
  if (error) throw ApiError.internal('Could not load that profile.');
  if (!data) throw ApiError.notFound('Profile not found.');

  const [resumes, education, experience, certifications] = await Promise.all([
    supabase.from('resumes').select('id, file_name, created_at').eq('profile_id', profileId),
    supabase.from('education').select('*').eq('profile_id', profileId).order('sort_order'),
    supabase.from('experience').select('*').eq('profile_id', profileId).order('sort_order'),
    supabase.from('certifications').select('*').eq('profile_id', profileId).order('sort_order'),
  ]);

  return {
    id: data.id,
    fullName: data.full_name,
    headline: data.headline,
    about: data.about,
    location: data.location,
    currentRole: data.current_title,
    yearsExperience: data.years_experience,
    skills: data.skills || [],
    languages: data.languages || [],
    portfolio: data.portfolio,
    linkedin: data.linkedin,
    github: data.github,
    website: data.website,
    avatarUrl: data.avatar_url,
    resumes: resumes.data || [],
    education: education.data || [],
    experience: experience.data || [],
    certifications: certifications.data || [],
  };
}

export { EDITABLE };