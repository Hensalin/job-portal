import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import StatusPill, { HIRING_STATUSES } from '../components/StatusPill.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import { SkeletonList, EmptyState, ErrorState } from '../components/Skeleton.jsx';
import Field, { TextInput, TextArea, Select } from '../components/Field.jsx';
import { timeAgo } from '../components/JobCard.jsx';
import { CompanyMark, IconClock, IconBriefcase, IconMapPin, IconArrowRight } from '../components/Icon.jsx';

/**
 * The hiring pipeline for one job.
 *
 * PRIVACY RULES ENFORCED HERE (they are also enforced on the server, but the
 * UI must not even offer the option):
 *   - Recruiter notes are PRIVATE. A candidate can never see them, so they are
 *     only fetched after the employer opens an application.
 *   - A resume link is only rendered for a shortlist/hire state, because the
 *     backend only issues a signed URL then.
 *
 * Both rules exist in applicationService too. Hiding a button is not security
 * - it is just not offering an action that would fail.
 */
/**
 * The form state uses CAMEL CASE on purpose.
 *
 * This used to be { scheduled_at, meeting_link, ... } and the submit sent those
 * snake_case keys straight through. The API expects camelCase
 * (applicationController reads req.body.scheduledAt and req.body.meetingLink),
 * so the server received `undefined`, ran `new Date(undefined)`, and answered
 * "Enter a valid date and time." no matter what the picker said - including a
 * perfectly good 12-10-2026 10:48.
 *
 * The naming rule for this project: the value RETURNED by an endpoint is
 * camelCase, but the body a form SENDS is whatever that endpoint's controller
 * reads. Profile writes snake_case because profileService reads snake_case;
 * interviews are read as camelCase, so interviews are sent as camelCase. Check
 * the controller before guessing.
 */
const EMPTY_INTERVIEW = { scheduledAt: '', type: 'video', meetingLink: '', location: '', notes: '' };

export default function Applicants() {
  const { id: jobId } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [job, setJob] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [note, setNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [interview, setInterview] = useState(EMPTY_INTERVIEW);
  const [scheduling, setScheduling] = useState(false);
  const [interviewError, setInterviewError] = useState('');

  const [rejecting, setRejecting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getJobApplications(jobId, {
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      });
      setJob(data.job);
      setApplicants(data.applicants || []);
      setCounts(data.counts || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, status, search]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (app) => {
    setOpenId(app.id);
    setDetail(null);
    setDetailLoading(true);
    setNote('');
    setInterview(EMPTY_INTERVIEW);
    try {
      setDetail(await api.getApplication(app.id));
    } catch (err) {
      toast.error(err.message);
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const setStatusFor = async (app, next) => {
    const snapshot = applicants;
    // Optimistic: the pill moves now, rolls back if the server refuses.
    setApplicants((list) => list.map((a) => (a.id === app.id ? { ...a, status: next } : a)));
    try {
      await api.setApplicationStatus(app.id, next);
      toast.success(`Moved to ${next}.`);
      if (detail?.id === app.id) setDetail((d) => ({ ...d, status: next }));
      load();
    } catch (err) {
      setApplicants(snapshot);
      toast.error(err.message);
    }
  };

  const confirmReject = async () => {
    setBusy(true);
    try {
      await api.setApplicationStatus(rejecting.id, 'rejected');
      toast.success('Application rejected.');
      setRejecting(null);
      setOpenId(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setAddingNote(true);
    try {
      const data = await api.addNote(openId, note.trim());
      setDetail((d) => ({ ...d, notes: [data.note, ...(d.notes || [])] }));
      setNote('');
      toast.success('Note added.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAddingNote(false);
    }
  };

  const schedule = async (e) => {
    e.preventDefault();
    setInterviewError('');
    if (!interview.scheduledAt) {
      return setInterviewError('Pick a date and time.');
    }
    if (interview.type === 'video' && !interview.meetingLink.trim()) {
      return setInterviewError('A video interview needs a meeting link.');
    }

    // datetime-local gives "2026-10-12T10:48" with no timezone, which the
    // browser reads as LOCAL time. toISOString() converts it to UTC, which is
    // what the timestamptz column stores. Without this step the server would
    // treat the bare string as UTC and the interview would land hours off.
    const when = new Date(interview.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return setInterviewError('That date and time could not be read. Pick it again.');
    }

    setScheduling(true);
    try {
      const created = await api.scheduleInterview(openId, {
        scheduledAt: when.toISOString(),
        type: interview.type,
        meetingLink: interview.meetingLink.trim() || undefined,
        location: interview.location.trim() || undefined,
        notes: interview.notes.trim() || undefined,
      });
      setDetail((d) => ({ ...d, interviews: [...(d.interviews || []), created.interview || created] }));
      setInterview(EMPTY_INTERVIEW);
      toast.success('Interview scheduled. The candidate was notified.');
    } catch (err) {
      if (err.details) setInterviewError(Object.values(err.details)[0]);
      else setInterviewError(err.message);
    } finally {
      setScheduling(false);
    }
  };

  const cancelInterview = async (interviewId) => {
    try {
      await api.cancelInterview(openId, interviewId);
      setDetail((d) => ({ ...d, interviews: (d.interviews || []).filter((i) => i.id !== interviewId) }));
      toast.success('Interview cancelled.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const downloadResume = async (app) => {
    try {
      const data = await api.getResumeDownloadUrl(app.id);
      const url = data.url || data.signedUrl;
      if (!url) return toast.error('No resume file is attached.');
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Applicants</h1>
          {job && <p className="muted">{job.title}</p>}
        </div>
        <Link className="btn btn-quiet" to={`/jobs/${jobId}`}>View job page</Link>
      </header>

      {/* ---------- pipeline summary ---------- */}
      <div className="pipeline">
        {HIRING_STATUSES.map((s) => (
          <button
            key={s}
            className={`pipe-step ${status === s ? 'on' : ''}`}
            onClick={() => setStatus(status === s ? '' : s)}
            aria-pressed={status === s}
          >
            <strong>{counts[s] || 0}</strong>
            <span>{s}</span>
          </button>
        ))}
        <button className="pipe-step" onClick={() => setStatus('')} aria-pressed={status === ''}>
          <strong>{Object.values(counts).reduce((a, b) => a + b, 0)}</strong>
          <span>total</span>
        </button>
      </div>

      <form className="search-bar" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <TextInput
          name="search" value={search} placeholder="Search by name, headline or skill"
          onChange={(_, v) => setSearch(v)} aria-label="Search applicants"
        />
        <button className="btn">Search</button>
        {(search || status) && (
          <button type="button" className="btn btn-quiet" onClick={() => { setSearch(''); setStatus(''); }}>
            Clear
          </button>
        )}
      </form>

      {loading && <SkeletonList count={3} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && applicants.length === 0 && (
        <EmptyState
          icon="👥"
          title={status ? `Nobody is at "${status}" yet` : 'No applicants yet'}
          message={status ? 'Pick another stage, or clear the filter.' : 'Share the job link, or check your listing is live.'}
          actionTo="/jobs"
          actionLabel="Back to jobs"
        />
      )}

      <div className="list">
        {applicants.map((a) => {
          const p = a.applicant || {};
          const advanced = ['shortlisted', 'interview', 'assessment', 'offer', 'hired'].includes(a.status);
          return (
            <article key={a.id} className="card job-card">
              <CompanyMark name={p.fullName || 'Applicant'} logoUrl={p.avatarUrl} size="lg" />

              <div className="job-card-body">
                <div className="job-card-top">
                  <div>
                    <h3 className="job-card-title">{p.fullName || 'Applicant'}</h3>
                    <p className="job-card-co">{p.headline || 'No headline'}</p>
                  </div>
                  <StatusPill value={a.status} />
                </div>

                <div className="job-card-meta">
                  {p.currentRole && <span><IconBriefcase size={15} /> {p.currentRole}</span>}
                  {p.location && <span><IconMapPin size={15} /> {p.location}</span>}
                  {p.yearsExperience ? <span><IconClock size={15} /> {p.yearsExperience} yrs</span> : null}
                  <span><IconClock size={15} /> applied {timeAgo(a.createdAt)}</span>
                </div>

                {p.skills?.length > 0 && (
                  <div className="job-card-tags">
                    {p.skills.slice(0, 6).map((s) => <span key={s} className="tagx tagx-skill">{s}</span>)}
                    {p.skills.length > 6 && <span className="tagx tagx-more">+{p.skills.length - 6}</span>}
                  </div>
                )}

                {(a.noteCount > 0 || a.interviews?.length > 0) && (
                  <p className="small muted">
                    {a.noteCount ? `${a.noteCount} note${a.noteCount === 1 ? '' : 's'}` : ''}
                    {a.noteCount > 0 && a.interviews?.length ? ' · ' : ''}
                    {a.interviews?.length ? `${a.interviews.length} interview(s)` : ''}
                  </p>
                )}
              </div>

              <div className="job-card-actions">
                <button className="btn btn-apply" onClick={() => openDetail(a)}>
                  View details <IconArrowRight size={16} />
                </button>
                <div className="row gap">
                  {advanced && a.resumeName && (
                    <button className="btn btn-quiet btn-sm" onClick={() => downloadResume(a)}>Resume</button>
                  )}
                  {a.status !== 'hired' && a.status !== 'rejected' && (
                    <button className="btn btn-danger btn-sm" onClick={() => setRejecting(a)}>Reject</button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* ---------- review modal ---------- */}
      <Modal
        open={!!openId}
        onClose={() => setOpenId(null)}
        title={detail?.applicant?.fullName || 'Application'}
        size="wide"
      >
        {detailLoading && <p className="muted">Loading…</p>}

        {detail && (
          <>
            <section className="row wrap gap">
              {HIRING_STATUSES.map((s) => (
                <button
                  key={s}
                  className={`chip ${detail.status === s ? 'on' : ''}`}
                  onClick={() => setStatusFor(detail, s)}
                  disabled={detail.status === s}
                >
                  {s}
                </button>
              ))}
            </section>

            <h3>Candidate</h3>
            <dl className="kv">
              <dt>Name</dt>
              <dd>
                {detail.applicant?.id ? (
                  <Link to={`/applicants/${detail.applicant.id}`}>{detail.applicant.fullName}</Link>
                ) : (detail.applicant?.fullName || '—')}
              </dd>
              <dt>Headline</dt><dd>{detail.applicant?.headline || '—'}</dd>
              <dt>Location</dt><dd>{detail.applicant?.location || '—'}</dd>
              <dt>Experience</dt><dd>{detail.applicant?.yearsExperience ?? '—'} years</dd>
              <dt>Expected salary</dt><dd>{detail.expectedSalary || '—'}</dd>
              <dt>Notice period</dt><dd>{detail.noticePeriod || '—'}</dd>
              <dt>Resume</dt><dd>{detail.resumeName || 'No resume attached'}</dd>
            </dl>

            {detail.applicant?.skills?.length > 0 && (
              <div className="badges">
                {detail.applicant.skills.map((s) => <span key={s} className="badge">{s}</span>)}
              </div>
            )}

            {detail.coverLetter && (
              <>
                <h3>Cover letter</h3>
                <p className="prewrap">{detail.coverLetter}</p>
              </>
            )}

            {detail.answers?.length > 0 && (
              <>
                <h3>Answers to your questions</h3>
                <dl className="kv">
                  {detail.answers.map((ans) => (
                    <div key={ans.id} className="kv-pair">
                      <dt>{ans.question}</dt>
                      <dd className="prewrap">{String(ans.answer ?? '—')}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {/* PRIVATE - never shown to the candidate. */}
            <h3>Internal notes</h3>
            <p className="muted small">Only your team can see these. The candidate never sees them.</p>

            <form onSubmit={addNote} className="form">
              <Field label="Add a note" htmlFor="note">
                <TextArea id="note" name="note" value={note} onChange={(n, v) => setNote(v)} rows={3}
                  placeholder="Strong React work, asked good questions about testing." />
              </Field>
              <button className="btn" disabled={addingNote || !note.trim()}>
                {addingNote ? 'Saving…' : 'Add note'}
              </button>
            </form>

            {detail.notes?.length > 0 && (
              <ul className="plain note-list">
                {detail.notes.map((n) => (
                  <li key={n.id}>
                    <p className="prewrap">{n.note}</p>
                    <span className="muted small">{n.author ? `${n.author} · ` : ''}{timeAgo(n.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}

            <h3>Interviews</h3>
            {detail.interviews?.length > 0 && (
              <ul className="plain">
                {detail.interviews.map((iv) => (
                  <li key={iv.id} className="row">
                    <span>
                      <strong>{new Date(iv.scheduledAt).toLocaleString()}</strong> · {iv.type}
                      {iv.meetingLink && <> · <a href={iv.meetingLink} target="_blank" rel="noreferrer noopener">Join</a></>}
                      {iv.location && ` · ${iv.location}`}
                    </span>
                    <button className="btn btn-danger btn-sm" onClick={() => cancelInterview(iv.id)}>Cancel</button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={schedule} className="form">
              <h4>Schedule an interview</h4>
              <div className="grid">
                <Field label="When" required error={interviewError} htmlFor="scheduledAt">
                  <TextInput id="scheduledAt" name="scheduledAt" type="datetime-local"
                    value={interview.scheduledAt} onChange={(_, v) => setInterview((i) => ({ ...i, scheduledAt: v }))}
                    error={interviewError} />
                </Field>
                <Field label="Type" htmlFor="iv-type">
                  <Select id="iv-type" name="type" value={interview.type}
                    onChange={(_, v) => setInterview((i) => ({ ...i, type: v }))}
                    options={['video', 'phone', 'in-person']} />
                </Field>
                <Field label="Meeting link" htmlFor="meetingLink">
                  <TextInput id="meetingLink" name="meetingLink" value={interview.meetingLink}
                    onChange={(_, v) => setInterview((i) => ({ ...i, meetingLink: v }))}
                    placeholder="https://meet.google.com/…" />
                </Field>
                <Field label="Location" hint="For in-person interviews." htmlFor="iv-location">
                  <TextInput id="iv-location" name="location" value={interview.location}
                    onChange={(_, v) => setInterview((i) => ({ ...i, location: v }))} />
                </Field>
              </div>
              <button className="btn" disabled={scheduling}>
                {scheduling ? 'Scheduling…' : 'Schedule interview'}
              </button>
            </form>

            {detail.status !== 'rejected' && detail.status !== 'withdrawn' && (
              <button className="btn btn-danger" onClick={() => setRejecting(detail)}>Reject this application</button>
            )}
          </>
        )}
      </Modal>

      <ConfirmModal
        open={!!rejecting}
        title="Reject this application?"
        message="The candidate will be notified. You can still view their application afterwards."
        confirmLabel="Reject"
        danger
        busy={busy}
        onConfirm={confirmReject}
        onClose={() => setRejecting(null)}
      />
    </>
  );
}