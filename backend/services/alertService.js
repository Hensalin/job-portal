import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { validateText } from '../utils/validators.js';
import { sanitizeSearch, EXPERIENCE_LEVELS, JOB_TYPES } from './jobService.js';
import { notify } from './notificationService.js';

const FREQUENCIES = ['daily', 'weekly'];

/**
 * Job alerts.
 *
 * HONESTY NOTE: matching happens in-app and immediately (see runAlert). Sending
 * real EMAIL requires an email provider (Resend / SendGrid / Nodemailer), which
 * is NOT configured in this project. Until one is, alerts only produce in-app
 * notifications - we do not pretend email is being sent.
 */
export async function listAlerts(profileId) {
  const { data, error } = await supabase
    .from('job_alerts').select('*').eq('profile_id', profileId).order('created_at', { ascending: false });
  if (error) throw ApiError.internal('Could not load your alerts.');
  return (data || []).map(shapeAlert);
}

function shapeAlert(a) {
  return {
    id: a.id,
    keyword: a.keyword,
    location: a.location,
    experienceLevel: a.experience_level,
    remoteOnly: a.remote_only,
    jobType: a.job_type,
    frequency: a.frequency,
    isActive: a.is_active,
    lastSentAt: a.last_sent_at,
    createdAt: a.created_at,
  };
}

export async function createAlert(profileId, body) {
  const keyword = validateText(body.keyword, { label: 'Keyword', required: false, max: 80 });
  if (!keyword.ok) throw ApiError.badRequest(keyword.error, { keyword: keyword.error });

  const errors = {};
  const row = { profile_id: profileId, keyword: keyword.value ?? null };

  if (body.location !== undefined) {
    const r = validateText(body.location, { label: 'Location', required: false, max: 120 });
    if (!r.ok) errors.location = r.error; else row.location = r.value;
  }
  if (body.experience_level) {
    if (!EXPERIENCE_LEVELS.includes(body.experience_level))
      errors.experience_level = 'Choose a valid experience level.';
    else row.experience_level = body.experience_level;
  }
  if (body.job_type) {
    if (!JOB_TYPES.includes(body.job_type)) errors.job_type = 'Choose a valid job type.';
    else row.job_type = body.job_type;
  }
  if (body.frequency) {
    if (!FREQUENCIES.includes(body.frequency)) errors.frequency = 'Choose daily or weekly.';
    else row.frequency = body.frequency;
  }
  if (Object.keys(errors).length) throw ApiError.badRequest(Object.values(errors)[0], errors);

  row.remote_only = !!body.remote_only;

  const { data, error } = await supabase.from('job_alerts').insert(row).select().single();
  if (error) throw ApiError.internal(error.message);
  return shapeAlert(data);
}

export async function updateAlert(profileId, id, body) {
  const { data: existing } = await supabase
    .from('job_alerts').select('*').eq('id', id).eq('profile_id', profileId).maybeSingle();
  if (!existing) throw ApiError.notFound('Alert not found.');

  const patch = {};
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  if (body.frequency !== undefined) {
    if (!FREQUENCIES.includes(body.frequency)) throw ApiError.badRequest('Choose daily or weekly.');
    patch.frequency = body.frequency;
  }
  if (body.keyword !== undefined) {
    const r = validateText(body.keyword, { label: 'Keyword', required: false, max: 80 });
    if (!r.ok) throw ApiError.badRequest(r.error);
    patch.keyword = r.value;
  }
  if (body.remote_only !== undefined) patch.remote_only = !!body.remote_only;

  const { data, error } = await supabase
    .from('job_alerts').update(patch).eq('id', id).eq('profile_id', profileId).select().single();
  if (error) throw ApiError.internal(error.message);
  return shapeAlert(data);
}

export async function deleteAlert(profileId, id) {
  const { error } = await supabase.from('job_alerts').delete().eq('id', id).eq('profile_id', profileId);
  if (error) throw ApiError.internal(error.message);
  return { message: 'Alert deleted.' };
}

/** Live preview: how many active jobs match right now. */
export async function previewAlert(profileId, body) {
  const { count, error } = await supabase
    .from('jobs').select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  if (error) throw ApiError.internal(error.message);
  return { matchingJobs: count || 0 };
}

/**
 * Runs one alert and notifies the seeker about matching jobs created since the
 * alert last ran. In-app only - see the HONESTY NOTE above.
 */
export async function runAlert(alert, seekerId) {
  const since = alert.last_sent_at || alert.created_at;

  let q = supabase.from('jobs').select('id, title, company, location').eq('status', 'active').gt('created_at', since);
  if (alert.keyword) q = q.or(`title.ilike.%${sanitizeSearch(alert.keyword)}%,description.ilike.%${sanitizeSearch(alert.keyword)}%`);
  if (alert.location) q = q.ilike('location', `%${sanitizeSearch(alert.location)}%`);
  if (alert.experience_level) q = q.eq('experience_level', alert.experience_level);
  if (alert.job_type) q = q.eq('type', alert.job_type);
  if (alert.remote_only) q = q.eq('work_mode', 'Remote');

  const { data, error } = await q.limit(20);
  if (error) throw ApiError.internal(error.message);

  const matches = data || [];
  if (matches.length) {
    await notify({
      profileId: seekerId,
      type: 'job_alert',
      title: `${matches.length} new job${matches.length > 1 ? 's' : ''} match your alert`,
      body: matches.slice(0, 3).map((m) => m.title).join(', '),
      link: '/jobs',
    });
  }
  await supabase.from('job_alerts').update({ last_sent_at: new Date().toISOString() }).eq('id', alert.id);
  return { matched: matches.length, jobs: matches };
}