import * as jobService from '../services/jobService.js';
import * as profileService from '../services/profileService.js';
import * as savedJobService from '../services/savedJobService.js';
// Default export, not a named one - config/supabase.js only has `export default`.
import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

/** GET /api/jobs - public search with filters, sort and pagination. */
export async function list(req, res, next) {
  try {
    const result = await jobService.listJobs(req.query, { viewerId: req.user?.id ?? null });
    res.json(result);
  } catch (e) { next(e); }
}

/** GET /api/jobs/recommended - real match scoring against the seeker profile. */
export async function recommended(req, res, next) {
  try {
    const profile = await profileService.getProfile(req.user.id);
    // getProfile returns camelCase; scoreJob reads the DB-style names, so map
    // them explicitly rather than relying on the shapes lining up.
    const jobs = await jobService.getRecommendedJobs({
      skills: profile.skills,
      currentRole: profile.currentRole,
      years_experience: profile.yearsExperience,
      preferred_location: profile.preferredLocation,
      location: profile.location,
      preferred_job_type: profile.preferredJobType,
      remote_preference: profile.remotePreference,
    }, 12);
    res.json({ jobs });
  } catch (e) { next(e); }
}

/** GET /api/jobs/options - enums + skill list for the filter UI. */
export async function options(_req, res) {
  res.json({
    types: jobService.JOB_TYPES,
    workModes: jobService.WORK_MODES,
    experienceLevels: jobService.EXPERIENCE_LEVELS,
    salaryPeriods: jobService.SALARY_PERIODS,
    remoteScopes: jobService.REMOTE_SCOPES,
    statuses: jobService.JOB_STATUSES,
    sorts: jobService.SORTS,
  });
}

export async function getOne(req, res, next) {
  try {
    const job = await jobService.getJob(req.params.id, { incrementViews: true });
    // Wrapped, like every other single-record endpoint (updateJob, setStatus
    // both return { job }). It used to spread the job at the top level, so the
    // React page read `data.job`, got undefined and rendered "This job no
    // longer exists" for a job that existed. One shape per endpoint.
    res.json({ job, questions: await jobService.getQuestions(req.params.id) });
  } catch (e) { next(e); }
}

/**
 * Sends the job with `isSaved` filled in for the current viewer.
 *
 * WHY THIS IS A SEPARATE FUNCTION: listJobs already marks saved jobs for the
 * viewer, but getJob does not - it just shapes whatever row it fetched, and
 * shapeJob maps `row.is_saved` to `isSaved`. On a single-job fetch that column
 * was never selected, so isSaved was always undefined and the detail page's
 * Save button rendered as "Save" even for a job the person had already saved.
 * Saving it again then unsaved it, which is worse than a cosmetic bug: it looks
 * like the button is not responding.
 */
export async function getOneForViewer(req, res, next) {
  try {
    const job = await jobService.getJob(req.params.id, { incrementViews: true });

    if (req.user?.id) {
      const { data } = await supabase
        .from('saved_jobs').select('job_id').eq('profile_id', req.user.id).eq('job_id', job.id).maybeSingle();
      job.isSaved = !!data;
    }

    res.json({ job, questions: await jobService.getQuestions(req.params.id) });
  } catch (e) { next(e); }
}

export async function similar(req, res, next) {
  try {
    const job = await jobService.getJob(req.params.id);
    res.json({ jobs: await jobService.getSimilarJobs(job, 6) });
  } catch (e) { next(e); }
}

export async function questions(req, res, next) {
  try { res.json({ questions: await jobService.getQuestions(req.params.id) }); }
  catch (e) { next(e); }
}

/** GET /api/jobs/mine/list - MUST be declared before /:id. */
export async function mine(req, res, next) {
  try {
    res.json({ jobs: await jobService.listJobsByEmployer(req.user.id, { status: req.query.status }) });
  } catch (e) { next(e); }
}

async function companyIdFor(userId) {
  const company = await profileService.getProfile(userId);
  return company.company?.id ?? null;
}

export async function create(req, res, next) {
  try {
    const job = await jobService.createJob(req.user.id, req.body, await companyIdFor(req.user.id));
    res.status(201).json({ job });
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try {
    res.json({ job: await jobService.updateJob(req.params.id, req.user.id, req.body) });
  } catch (e) { next(e); }
}

export async function setStatus(req, res, next) {
  try {
    res.json({ job: await jobService.setStatus(req.params.id, req.user.id, req.body.status) });
  } catch (e) { next(e); }
}

export async function duplicate(req, res, next) {
  try {
    const job = await jobService.duplicateJob(req.params.id, req.user.id, await companyIdFor(req.user.id));
    res.status(201).json({ job });
  } catch (e) { next(e); }
}

export async function remove(req, res, next) {
  try { res.json(await jobService.deleteJob(req.params.id, req.user.id)); }
  catch (e) { next(e); }
}

// ---------------------------------------------------------------- saved jobs

export async function save(req, res, next) {
  try { res.status(201).json(await savedJobService.saveJob({ jobId: req.params.id, profileId: req.user.id })); }
  catch (e) { next(e); }
}

export async function unsave(req, res, next) {
  try { res.json(await savedJobService.unsaveJob({ jobId: req.params.id, profileId: req.user.id })); }
  catch (e) { next(e); }
}

export async function listSaved(req, res, next) {
  try { res.json({ jobs: await savedJobService.listSavedJobs(req.user.id) }); }
  catch (e) { next(e); }
}

// ---------------------------------------------------------------- reports

export async function report(req, res, next) {
  try {
    res.status(201).json(await jobService.reportJob({
      jobId: req.params.id,
      reporterId: req.user.id,
      reason: req.body.reason,
      details: req.body.details,
    }));
  } catch (e) { next(e); }
}