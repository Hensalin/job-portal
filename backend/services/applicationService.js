import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { validateText } from '../utils/validators.js';
import { notify } from './notificationService.js';
import { getQuestions } from './jobService.js';
import { signedResumeUrl } from '../config/storage.js';

export const PIPELINE = ['applied', 'viewed', 'shortlisted', 'interview', 'assessment', 'offer', 'hired'];
export const TERMINAL = ['rejected', 'withdrawn'];
export const ALL_STATUSES = [...PIPELINE, ...TERMINAL];

const STATUS_LABEL = {
  applied: 'Applied', viewed: 'Application Viewed', shortlisted: 'Shortlisted',
  interview: 'Interview', assessment: 'Assessment', offer: 'Offer',
  hired: 'Hired', rejected: 'Rejected', withdrawn: 'Withdrawn',
};

const shapeApplication = (row) => ({
  id: row.id,
  jobId: row.job_id,
  applicantId: row.applicant_id,
  coverLetter: row.cover_letter,
  status: row.status,
  statusLabel: STATUS_LABEL[row.status] || row.status,
  expectedSalary: row.expected_salary,
  noticePeriod: row.notice_period,
  currentLocation: row.current_location,
  resumeId: row.resume_id,
  resumeName: row.resume_name,
  createdAt: row.created_at,
  updatedAt: row.status_updated_at || row.updated_at || row.created_at,
  job: row.jobs
    ? {
        id: row.jobs.id,
        title: row.jobs.title,
        company: row.jobs.company,
        location: row.jobs.location,
        city: row.jobs.city,
        type: row.jobs.type,
        workMode: row.jobs.work_mode,
        status: row.jobs.status,
        employerId: row.jobs.employer_id,
        companyRef: row.jobs.companies
          ? { id: row.jobs.companies.id, name: row.jobs.companies.name, logoUrl: row.jobs.companies.logo_url }
          : undefined,
      }
    : undefined,
  applicant: row.profiles
    ? {
        id: row.profiles.id,
        fullName: row.profiles.full_name,
        headline: row.profiles.headline,
        location: row.profiles.location,
        currentRole: row.profiles.current_title,
        yearsExperience: row.profiles.years_experience,
        skills: row.profiles.skills || [],
        avatarUrl: row.profiles.avatar_url,
      }
    : undefined,
});

/** Guard: you can only move an application forward through the pipeline. */
function assertTransition(from, to) {
  if (from === to) return;
  if (!ALL_STATUSES.includes(to)) throw ApiError.badRequest('Invalid application status.');
  if (TERMINAL.includes(from) && to !== 'withdrawn')
    throw ApiError.badRequest(`This application is already ${STATUS_LABEL[from].toLowerCase()}.`);
}

// ------------------------------------------------------------------ create

export async function apply({ applicantId, jobId, coverLetter, expectedSalary, noticePeriod, currentLocation, resumeId, answers = [] }) {
  const { data: job, error: jobErr } = await supabase
    .from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (jobErr) throw ApiError.internal('Could not load that job.');
  if (!job) throw ApiError.notFound('Job not found.');
  if (job.status !== 'active') throw ApiError.badRequest('This job is no longer accepting applications.');

  const questions = await getQuestions(jobId);

  // Required questions must be answered.
  const answerMap = new Map();
  for (const a of answers) {
    if (a?.questionId) answerMap.set(a.questionId, a.answer);
  }
  const missing = questions.filter(
    (q) => q.isRequired && !String(answerMap.get(q.id) ?? '').trim()
  );
  if (missing.length)
    throw ApiError.badRequest(`Please answer: "${missing[0].question}"`, {
      answers: missing.map((q) => q.question),
    });

  // Attach the resume snapshot so the employer always sees the file that was
  // actually submitted, even if the seeker later replaces or deletes it.
  //
  // The seeker PICKS a resume on the apply form, so honour that choice. It used
  // to be ignored: this block always took the default/newest one, so ticking a
  // different resume in the modal changed nothing and the employer received a
  // file the candidate had not chosen. When nothing was picked we still fall
  // back to the default, which is what a one-tap apply should do.
  let resumeRow = null;
  {
    if (resumeId) {
      // Scoped to the applicant on purpose - without the eq(profile_id) an
      // applicant could attach somebody else's resume id to their application.
      const { data: picked } = await supabase
        .from('resumes').select('*')
        .eq('id', resumeId).eq('profile_id', applicantId)
        .maybeSingle();
      resumeRow = picked || null;
    }
    if (!resumeRow) {
      const { data: fallback } = await supabase
        .from('resumes').select('*').eq('profile_id', applicantId)
        .order('is_default', { ascending: false }).order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      resumeRow = fallback || null;
    }
  }
  const resumeUrl = resumeRow?.file_url || null;
  const resumeName = resumeRow?.file_name || null;

  const { data: created, error } = await supabase
    .from('applications')
    .insert({
      job_id: jobId,
      applicant_id: applicantId,
      cover_letter: coverLetter ? String(coverLetter).slice(0, 5000) : null,
      expected_salary: expectedSalary ? String(expectedSalary).slice(0, 60) : null,
      notice_period: noticePeriod ? String(noticePeriod).slice(0, 60) : null,
      current_location: currentLocation ? String(currentLocation).slice(0, 120) : null,
      resume_id: resumeRow?.id || null,
      resume_url: resumeUrl,
      resume_name: resumeName,
      status: 'applied',
      status_updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    // unique(job_id, applicant_id)
    if (error.code === '23505') throw ApiError.conflict('You already applied to this job.');
    throw ApiError.internal(error.message);
  }

  if (questions.length) {
    const rows = questions.map((q) => ({
      application_id: created.id,
      question_id: q.id,
      question: q.question,
      answer: answerMap.has(q.id) ? String(answerMap.get(q.id) ?? '').slice(0, 2000) : null,
    }));
    await supabase.from('application_answers').insert(rows);
  }

  await notify({
    profileId: job.employer_id,
    type: 'new_application',
    title: 'New application received',
    body: `Someone applied for ${job.title}.`,
    link: `/dashboard/applicants/${job.id}`,
  });

  return shapeApplication({ ...created, jobs: job });
}

// ------------------------------------------------------------------ read

export async function myApplications(applicantId, { status } = {}) {
  let q = supabase
    .from('applications')
    .select('*, jobs(id, title, company, location, city, type, work_mode, status, employer_id, companies(id, name, logo_url))')
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false });
  if (status && ALL_STATUSES.includes(status)) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw ApiError.internal('Could not load your applications.');
  return (data || []).map(shapeApplication);
}

export async function getApplication(id, viewerId, viewerRole) {
  const { data, error } = await supabase
    .from('applications')
    .select('*, jobs(*, companies(id, name, logo_url)), profiles(id, full_name, headline, location, current_title, years_experience, skills, avatar_url)')
    .eq('id', id).maybeSingle();
  if (error) throw ApiError.internal('Could not load that application.');
  if (!data) throw ApiError.notFound('Application not found.');

  const isOwner = data.applicant_id === viewerId;
  const isEmployer = data.jobs?.employer_id === viewerId;
  if (!isOwner && !isEmployer && viewerRole !== 'admin')
    throw ApiError.forbidden('You cannot view this application.');

  const [answers, notes, interviews] = await Promise.all([
    supabase.from('application_answers').select('*').eq('application_id', id),
    // Recruiter notes are PRIVATE: only ever fetched for the employer.
    isEmployer || viewerRole === 'admin'
      ? supabase.from('recruiter_notes').select('*, author:profiles!recruiter_notes_author_id_fkey(full_name)').eq('application_id', id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from('interviews').select('*').eq('application_id', id).order('scheduled_at'),
  ]);

  const shaped = shapeApplication(data);

  // Never send resume_url to the candidate - only the employer gets the link.
  if (isOwner) delete shaped.resumeId;

  return {
    ...shaped,
    answers: (answers.data || []).map((a) => ({ id: a.id, question: a.question, answer: a.answer })),
    notes: (notes.data || []).map((n) => ({ id: n.id, note: n.note, createdAt: n.created_at, author: n.author?.full_name })),
    interviews: (interviews.data || []).map((i) => ({
      id: i.id, scheduledAt: i.scheduled_at, type: i.type,
      meetingLink: i.meeting_link, location: i.location, notes: i.notes,
    })),
  };
}

/** Applicants for one job. Employer only, and only for their own job. */
export async function jobApplicants({ jobId, employerId, status, search }) {
  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (!job) throw ApiError.notFound('Job not found.');
  if (job.employer_id !== employerId) throw ApiError.forbidden('Not your job.');

  let q = supabase
    .from('applications')
    .select('*, profiles(id, full_name, headline, location, current_title, years_experience, skills, avatar_url)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  if (status && ALL_STATUSES.includes(status)) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw ApiError.internal('Could not load applicants.');

  let rows = data || [];
  if (search) {
    const term = String(search).toLowerCase().trim();
    rows = rows.filter((r) => {
      const p = r.profiles || {};
      return (
        (p.full_name || '').toLowerCase().includes(term) ||
        (p.headline || '').toLowerCase().includes(term) ||
        (p.skills || []).some((s) => String(s).toLowerCase().includes(term))
      );
    });
  }

  // Mark the first time an employer opens an application as "viewed".
  const unseen = rows.filter((r) => r.status === 'applied').map((r) => r.id);
  if (unseen.length) {
    await supabase
      .from('applications')
      .update({ status: 'viewed', status_updated_at: new Date().toISOString() })
      .in('id', unseen);
    for (const r of rows) if (r.status === 'applied') r.status = 'viewed';
    await Promise.all(unseen.map((id) => {
      const row = rows.find((r) => r.id === id);
      return notify({
        profileId: row?.applicant_id,
        type: 'application_viewed',
        title: 'Your application was viewed',
        body: `Your application for ${job.title} has been viewed.`,
        link: '/applications',
      });
    }));
  }

  const [noteCounts, interviewRows] = await Promise.all([
    supabase.from('recruiter_notes').select('application_id').eq('application_id', rows.length ? rows.map((r) => r.id) : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('interviews').select('*').in('application_id', rows.length ? rows.map((r) => r.id) : ['00000000-0000-0000-0000-000000000000']).order('scheduled_at'),
  ]);
  const noteCount = {};
  for (const n of noteCounts.data || []) noteCount[n.application_id] = (noteCount[n.application_id] || 0) + 1;
  const interviewsByApp = {};
  for (const i of interviewRows.data || []) (interviewsByApp[i.application_id] ||= []).push(i);

  return {
    job: { id: job.id, title: job.title, status: job.status },
    applicants: rows.map((r) => ({
      ...shapeApplication(r),
      noteCount: noteCount[r.id] || 0,
      interviews: (interviewsByApp[r.id] || []).map((i) => ({
        id: i.id, scheduledAt: i.scheduled_at, type: i.type, meetingLink: i.meeting_link,
      })),
    })),
    counts: rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {}),
  };
}

// ------------------------------------------------------------------ update

export async function updateStatus({ applicationId, employerId, status, actorRole }) {
  if (!ALL_STATUSES.includes(status)) throw ApiError.badRequest('Invalid application status.');

  const { data: app } = await supabase
    .from('applications').select('id, applicant_id, status, jobs(id, title, employer_id)').eq('id', applicationId).maybeSingle();
  if (!app) throw ApiError.notFound('Application not found.');
  if (app.jobs?.employer_id !== employerId && actorRole !== 'admin')
    throw ApiError.forbidden('Not your job.');

  assertTransition(app.status, status);
  if (app.status === status) return shapeApplication(app);

  const { data, error } = await supabase
    .from('applications')
    .update({ status, status_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', applicationId).select().single();
  if (error) throw ApiError.internal(error.message);

  const labels = {
    viewed: 'Your application was viewed',
    shortlisted: 'You have been shortlisted',
    interview: 'An interview has been scheduled for you',
    assessment: 'There is an assessment for you to complete',
    offer: 'Congratulations - you have received an offer',
    hired: 'You have been hired',
    rejected: 'Your application was not successful this time',
  };
  if (labels[status]) {
    await notify({
      profileId: app.applicant_id,
      type: `application_${status}`,
      title: labels[status],
      body: `${app.jobs?.title ?? 'Your application'}`,
      link: '/applications',
    });
  }
  return shapeApplication(data);
}

/** The seeker pulls their own application. */
export async function withdraw({ applicationId, applicantId }) {
  const { data: app } = await supabase
    .from('applications').select('*, jobs(title, employer_id)').eq('id', applicationId).maybeSingle();
  if (!app) throw ApiError.notFound('Application not found.');
  if (app.applicant_id !== applicantId) throw ApiError.forbidden('Not your application.');
  if (['hired', 'rejected', 'withdrawn'].includes(app.status))
    throw ApiError.badRequest(`This application is already ${app.status}.`);

  const { data, error } = await supabase
    .from('applications')
    .update({ status: 'withdrawn', status_updated_at: new Date().toISOString() })
    .eq('id', applicationId).select().single();
  if (error) throw ApiError.internal(error.message);

  await notify({
    profileId: app.jobs?.employer_id,
    type: 'candidate_withdrew',
    title: 'A candidate withdrew',
    body: `A candidate withdrew from ${app.jobs?.title}.`,
  });
  return shapeApplication(data);
}

// ------------------------------------------------------------------ notes

export async function addNote({ applicationId, authorId, note }) {
  const text = validateText(note, { label: 'Note', min: 2, max: 2000 });
  if (!text.ok) throw ApiError.badRequest(text.error, { note: text.error });

  const { data: app } = await supabase
    .from('applications').select('id, jobs(employer_id)').eq('id', applicationId).maybeSingle();
  if (!app) throw ApiError.notFound('Application not found.');
  if (app.jobs?.employer_id !== authorId) throw ApiError.forbidden('Not your job.');

  const { data, error } = await supabase
    .from('recruiter_notes').insert({ application_id: applicationId, author_id: authorId, note: text.value })
    .select().single();
  if (error) throw ApiError.internal(error.message);
  return { id: data.id, note: data.note, createdAt: data.created_at };
}

export async function listNotes({ applicationId, employerId }) {
  const { data: app } = await supabase
    .from('applications').select('id, jobs(employer_id)').eq('id', applicationId).maybeSingle();
  if (!app) throw ApiError.notFound('Application not found.');
  if (app.jobs?.employer_id !== employerId) throw ApiError.forbidden('Not your job.');

  const { data, error } = await supabase
    .from('recruiter_notes')
    .select('*, author:profiles!recruiter_notes_author_id_fkey(full_name)')
    .eq('application_id', applicationId).order('created_at', { ascending: false });
  if (error) throw ApiError.internal(error.message);
  return (data || []).map((n) => ({ id: n.id, note: n.note, createdAt: n.created_at, author: n.author?.full_name }));
}

// ------------------------------------------------------------------ interviews

const INTERVIEW_TYPES = ['video', 'phone', 'in-person'];

export async function scheduleInterview({ applicationId, employerId, scheduledAt, type, meetingLink, location, notes }) {
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) throw ApiError.badRequest('Enter a valid date and time.', { scheduledAt: 'Enter a valid date and time.' });
  if (when.getTime() < Date.now() - 60_000) throw ApiError.badRequest('Interview must be in the future.', { scheduledAt: 'Must be in the future.' });
  if (!INTERVIEW_TYPES.includes(type)) throw ApiError.badRequest('Choose a valid interview type.', { type: 'Choose a valid type.' });
  if (type !== 'in-person' && !meetingLink) throw ApiError.badRequest('A meeting link is required.', { meetingLink: 'Add a meeting link.' });
  if (type === 'in-person' && !location) throw ApiError.badRequest('A location is required.', { location: 'Add a location.' });

  const { data: app } = await supabase
    .from('applications').select('id, applicant_id, status, jobs(id, title, employer_id)').eq('id', applicationId).maybeSingle();
  if (!app) throw ApiError.notFound('Application not found.');
  if (app.jobs?.employer_id !== employerId) throw ApiError.forbidden('Not your job.');

  const { data, error } = await supabase
    .from('interviews')
    .insert({
      application_id: applicationId, created_by: employerId,
      scheduled_at: when.toISOString(), type,
      meeting_link: meetingLink || null, location: location || null, notes: notes || null,
    })
    .select().single();
  if (error) throw ApiError.internal(error.message);

  if (app.status === 'applied' || app.status === 'viewed' || app.status === 'shortlisted') {
    await supabase.from('applications')
      .update({ status: 'interview', status_updated_at: new Date().toISOString() })
      .eq('id', applicationId);
  }

  await notify({
    profileId: app.applicant_id,
    type: 'interview_scheduled',
    title: 'Interview scheduled',
    body: `${app.jobs?.title} - ${when.toUTCString()}`,
    link: '/applications',
  });

  return {
    id: data.id, scheduledAt: data.scheduled_at, type: data.type,
    meetingLink: data.meeting_link, location: data.location, notes: data.notes,
  };
}

export async function cancelInterview({ interviewId, employerId }) {
  const { data: iv } = await supabase
    .from('interviews').select('id, application_id, applications!inner(jobs(employer_id))').eq('id', interviewId).maybeSingle();
  const owner = iv?.applications?.jobs?.employer_id;
  if (!iv) throw ApiError.notFound('Interview not found.');
  if (owner !== employerId) throw ApiError.forbidden('Not your interview.');

  const { error } = await supabase.from('interviews').delete().eq('id', interviewId);
  if (error) throw ApiError.internal(error.message);
  return { message: 'Interview cancelled.' };
}

/** Short-lived signed link so an employer can download the resume. */
export async function resumeDownloadUrl({ applicationId, employerId }) {
  const { data: app } = await supabase
    .from('applications').select('resume_url, applicant_id, jobs(employer_id, title)').eq('id', applicationId).maybeSingle();
  if (!app) throw ApiError.notFound('Application not found.');
  if (app.jobs?.employer_id !== employerId) throw ApiError.forbidden('Not your job.');
  if (!app.resume_url) throw ApiError.notFound('No resume was attached to this application.');

  const url = await signedResumeUrl(app.resume_url, 300);
  if (!url) throw ApiError.internal('Could not generate a download link.');
  return { url, expiresIn: 300 };
}

export { STATUS_LABEL, shapeApplication };