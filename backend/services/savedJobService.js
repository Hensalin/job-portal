import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { shapeJob } from './jobService.js';

export async function saveJob({ jobId, profileId }) {
  const { data: job } = await supabase
    .from('jobs').select('id, title, status').eq('id', jobId).maybeSingle();
  if (!job) throw ApiError.notFound('Job not found.');

  const { error } = await supabase
    .from('saved_jobs').insert({ profile_id: profileId, job_id: jobId });
  if (error) {
    // primary key (profile_id, job_id) already blocks duplicates
    if (error.code === '23505') throw ApiError.conflict('You have already saved this job.');
    throw ApiError.internal(error.message);
  }
  return { jobId, saved: true, message: 'Job saved.' };
}

export async function unsaveJob({ jobId, profileId }) {
  const { error } = await supabase
    .from('saved_jobs').delete().eq('profile_id', profileId).eq('job_id', jobId);
  if (error) throw ApiError.internal(error.message);
  return { jobId, saved: false, message: 'Job removed from saved.' };
}

export async function listSavedJobs(profileId) {
  const { data, error } = await supabase
    .from('saved_jobs')
    .select('created_at, jobs(id, title, company, location, city, state, country, type, work_mode, experience_level, salary_min, salary_max, currency, salary_period, hide_salary, status, created_at, description, companies(id, name, logo_url, industry, size, location, is_verified))')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw ApiError.internal('Could not load your saved jobs.');
  return (data || [])
    .map((r) => ({ ...shapeJob(r.jobs), savedAt: r.created_at, isSaved: true }))
    .filter((j) => j.id);
}