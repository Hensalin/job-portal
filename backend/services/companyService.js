import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { validateText, validateUrl, validateYear, validateEmail, validatePhone } from '../utils/validators.js';

const asArray = (v) =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 40)
    : typeof v === 'string'
      ? v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 40)
      : [];

const SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

export async function getCompanyByOwner(ownerId) {
  const { data, error } = await supabase
    .from('companies').select('*').eq('owner_id', ownerId).maybeSingle();
  if (error) throw ApiError.internal('Could not load your company.');
  return shape(data);
}

export async function getCompanyById(id) {
  const { data, error } = await supabase.from('companies').select('*').eq('id', id).maybeSingle();
  if (error) throw ApiError.internal('Could not load that company.');
  if (!data) throw ApiError.notFound('Company not found.');
  return shape(data);
}

export async function upsertCompany(ownerId, body) {
  const patch = { owner_id: ownerId, updated_at: new Date().toISOString() };
  const errors = {};

  const name = validateText(body.name, { label: 'Company name', min: 2, max: 120 });
  if (!name.ok) errors.name = name.error; else patch.name = name.value;

  const optionalText = (field, label, max) => {
    if (body[field] === undefined) return;
    const r = validateText(body[field], { label, required: false, max });
    if (!r.ok) errors[field] = r.error; else patch[field] = r.value;
  };
  optionalText('industry', 'Industry', 100);
  optionalText('location', 'Location', 150);
  optionalText('about', 'About', 4000);
  optionalText('culture', 'Culture', 3000);
  optionalText('email', 'Email', 150);
  optionalText('phone', 'Phone', 20);

  if (body.website !== undefined) {
    const r = validateUrl(body.website, 'Website');
    if (!r.ok) errors.website = r.error; else patch.website = r.value;
  }
  if (body.logo_url !== undefined) {
    const r = validateUrl(body.logo_url, 'Logo');
    if (!r.ok) errors.logo_url = r.error; else patch.logo_url = r.value;
  }
  if (body.founded_year !== undefined && body.founded_year !== '') {
    const r = validateYear(body.founded_year, { label: 'Founded year' });
    if (!r.ok) errors.founded_year = r.error; else patch.founded_year = r.value;
  }
  if (body.size !== undefined && body.size !== '') {
    if (!SIZES.includes(body.size)) errors.size = 'Choose a valid company size.';
    else patch.size = body.size;
  }
  if (body.email) {
    const r = validateEmail(body.email);
    if (!r.ok) errors.email = r.error; else patch.email = r.value;
  }
  if (body.phone) {
    const r = validatePhone(body.phone);
    if (!r.ok) errors.phone = r.error; else patch.phone = r.value;
  }
  if (body.benefits !== undefined) patch.benefits = asArray(body.benefits);
  if (body.social_links !== undefined && body.social_links && typeof body.social_links === 'object') {
    const links = {};
    for (const [k, v] of Object.entries(body.social_links)) {
      if (!v) continue;
      const r = validateUrl(v, k);
      if (!r.ok) errors[`social_${k}`] = r.error; else links[k] = r.value;
    }
    patch.social_links = links;
  }

  if (Object.keys(errors).length) throw ApiError.badRequest(Object.values(errors)[0], errors);

  // One company per employer: upsert on the unique owner_id index.
  const { data: existing } = await supabase
    .from('companies').select('id').eq('owner_id', ownerId).maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('companies').update(patch).eq('id', existing.id).select().single();
    if (error) throw ApiError.internal('Could not save your company.');
    return shape(data);
  }

  const { data, error } = await supabase
    .from('companies').insert({ ...patch, status: 'approved' }).select().single();
  if (error) {
    if (error.code === '23505') return getCompanyByOwner(ownerId); // lost a race, fine
    throw ApiError.internal('Could not create your company.');
  }
  return shape(data);
}

/** Company page + its open jobs. */
export async function getCompanyPublic(id) {
  const company = await getCompanyById(id);
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, location, city, type, work_mode, salary_min, salary_max, currency, salary_period, hide_salary, experience_level, created_at, status')
    .eq('company_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw ApiError.internal('Could not load jobs for this company.');
  return { ...company, jobs: (jobs || []).map(shapeJobLite) };
}

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    logoUrl: row.logo_url,
    industry: row.industry,
    size: row.size,
    foundedYear: row.founded_year,
    website: row.website,
    email: row.email,
    phone: row.phone,
    location: row.location,
    about: row.about,
    culture: row.culture,
    benefits: row.benefits || [],
    socialLinks: row.social_links || {},
    isVerified: row.is_verified,
    status: row.status,
    createdAt: row.created_at,
  };
}

function shapeJobLite(j) {
  return {
    id: j.id,
    title: j.title,
    location: j.location,
    city: j.city,
    type: j.type,
    workMode: j.work_mode,
    experienceLevel: j.experience_level,
    salaryMin: j.salary_min,
    salaryMax: j.salary_max,
    currency: j.currency,
    salaryPeriod: j.salary_period,
    hideSalary: j.hide_salary,
    status: j.status,
    createdAt: j.created_at,
  };
}

export { SIZES, shape as shapeCompany, shapeJobLite };