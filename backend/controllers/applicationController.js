import * as applicationService from '../services/applicationService.js';
import { ApiError } from '../utils/ApiError.js';

export async function create(req, res, next) {
  try {
    const { jobId, coverLetter, expectedSalary, noticePeriod, currentLocation, resumeId, answers } = req.body;
    if (!jobId) throw ApiError.badRequest('jobId is required.', { jobId: 'This field is required.' });

    const application = await applicationService.apply({
      applicantId: req.user.id,
      jobId,
      coverLetter,
      expectedSalary,
      noticePeriod,
      currentLocation,
      resumeId,
      answers: Array.isArray(answers) ? answers : [],
    });
    res.status(201).json({ application, message: 'Application submitted successfully.' });
  } catch (e) { next(e); }
}

/** GET /api/applications/mine */
export async function mine(req, res, next) {
  try {
    res.json({
      applications: await applicationService.myApplications(req.user.id, { status: req.query.status }),
      statuses: applicationService.ALL_STATUSES,
    });
  } catch (e) { next(e); }
}

/** GET /api/applications/:id */
export async function getOne(req, res, next) {
  try {
    res.json({
      application: await applicationService.getApplication(req.params.id, req.user.id, req.user.role),
      pipeline: applicationService.PIPELINE,
    });
  } catch (e) { next(e); }
}

export async function withdraw(req, res, next) {
  try {
    res.json({ application: await applicationService.withdraw({ applicationId: req.params.id, applicantId: req.user.id }) });
  } catch (e) { next(e); }
}

/** PATCH /api/applications/:id/status - employer moves the pipeline. */
export async function setStatus(req, res, next) {
  try {
    res.json({
      application: await applicationService.updateStatus({
        applicationId: req.params.id,
        employerId: req.user.id,
        status: req.body.status,
        actorRole: req.user.role,
      }),
    });
  } catch (e) { next(e); }
}

/** GET /api/jobs/:jobId/applicants lives here for legacy path compatibility. */
export async function forJob(req, res, next) {
  try {
    res.json(await applicationService.jobApplicants({
      jobId: req.params.jobId,
      employerId: req.user.id,
      status: req.query.status,
      search: req.query.search,
    }));
  } catch (e) { next(e); }
}

// ---------------------------------------------------------------- notes

export async function addNote(req, res, next) {
  try {
    res.status(201).json({
      note: await applicationService.addNote({
        applicationId: req.params.id, authorId: req.user.id, note: req.body.note,
      }),
    });
  } catch (e) { next(e); }
}

export async function listNotes(req, res, next) {
  try {
    res.json({ notes: await applicationService.listNotes({ applicationId: req.params.id, employerId: req.user.id }) });
  } catch (e) { next(e); }
}

// ---------------------------------------------------------------- interviews

export async function scheduleInterview(req, res, next) {
  try {
    res.status(201).json({
      interview: await applicationService.scheduleInterview({
        applicationId: req.params.id,
        employerId: req.user.id,
        scheduledAt: req.body.scheduledAt,
        type: req.body.type,
        meetingLink: req.body.meetingLink,
        location: req.body.location,
        notes: req.body.notes,
      }),
    });
  } catch (e) { next(e); }
}

export async function cancelInterview(req, res, next) {
  try {
    res.json(await applicationService.cancelInterview({ interviewId: req.params.interviewId, employerId: req.user.id }));
  } catch (e) { next(e); }
}

// ---------------------------------------------------------------- resume dl

export async function resumeDownload(req, res, next) {
  try {
    res.json(await applicationService.resumeDownloadUrl({ applicationId: req.params.id, employerId: req.user.id }));
  } catch (e) { next(e); }
}

export { applicationService };