import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import JobCard, { formatSalary, timeAgo } from '../components/JobCard.jsx';
import ApplyModal from '../components/ApplyModal.jsx';
import Modal from '../components/Modal.jsx';
import { Skeleton, ErrorState } from '../components/Skeleton.jsx';
import Field, { TextArea, Select } from '../components/Field.jsx';
import StatusPill from '../components/StatusPill.jsx';
import {
  IconMapPin, IconWallet, IconClock, IconBookmark, IconUsers,
  IconBriefcase, IconBuilding, IconArrowRight, CompanyMark,
} from '../components/Icon.jsx';

const REPORT_REASONS = [
  'Fake or scam job',
  'Discriminatory wording',
  'Company information is wrong',
  'Unrelated or duplicated listing',
  'Salary is misleading',
  'Other',
];

/** Long descriptions are stored as plain text with blank lines between parts. */
function Sections({ job }) {
  const parts = [
    ['Overview', job.overview],
    ['About the company', job.aboutCompany],
    ['What you will do', job.responsibilities],
    ['Skills required', job.qualifications],
    ['Experience', job.experienceRequired],
    ['Education', job.educationReq],
    ['Benefits', job.benefits],
    ['Perks', job.perks],
    ['Work environment', job.workEnvironment],
  ].filter(([, text]) => text && String(text).trim());

  if (!parts.length && job.description) {
    return <p className="prewrap">{job.description}</p>;
  }

  return (
    <>
      {job.description && <p className="prewrap">{job.description}</p>}
      {parts.map(([heading, text]) => (
        <section key={heading} className="jd-section">
          <h2 className="jd-h">{heading}</h2>
          {String(text).split(/\n{2,}|\n(?=[-•])/).map((para, i) => (
            para.trim().startsWith('-') || para.trim().startsWith('•')
              ? <p key={i} className="jd-bullet">• {para.trim().replace(/^[-•]\s*/, '')}</p>
              : <p key={i} className="prewrap">{para}</p>
          ))}
        </section>
      ))}
    </>
  );
}

export default function JobDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [job, setJob] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [applyOpen, setApplyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState({ reason: '', details: '' });
  const [applied, setApplied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getJob(id);
      setJob(data.job);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Secondary data loads after the job renders, so a slow one cannot delay the page.
  useEffect(() => {
    if (!job) return;
    api.getSimilarJobs(id).then((d) => setSimilar(d.jobs || [])).catch(() => {});
  }, [id, job?.id]);

  const toggleSave = async () => {
    const was = job.isSaved;
    setJob((j) => ({ ...j, isSaved: !was }));
    try {
      if (was) { await api.unsaveJob(id); toast.info('Removed from saved jobs.'); }
      else { await api.saveJob(id); toast.success('Saved. Find it under Saved Jobs.'); }
    } catch (err) {
      setJob((j) => ({ ...j, isSaved: was }));
      toast.error(err.message);
    }
  };

  const submitReport = async (e) => {
    e.preventDefault();
    if (!report.reason) return toast.error('Pick a reason.');
    try {
      await api.reportJob(id, { reason: report.reason, details: report.details.trim() || undefined });
      toast.success('Thanks. Our team will review this listing.');
      setReportOpen(false);
      setReport({ reason: '', details: '' });
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <><Skeleton lines={4} height="1.4rem" /></>;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!job) return <ErrorState message="This job no longer exists." />;

  const isSeeker = user?.role === 'seeker';
  const isOwnJob = user && job.employerId === user.id;
  const salary = formatSalary(job);
  const company = job.companyRef;
  const companyName = company?.name || job.company || 'Confidential';
  const closed = job.status !== 'active';

  const facts = [
    job.location && { Icon: IconMapPin, label: 'Location', value: job.location },
    salary && { Icon: IconWallet, label: 'Salary', value: salary },
    job.experienceLevel && { Icon: IconBriefcase, label: 'Experience', value: job.experienceLevel },
    job.openings && { Icon: IconUsers, label: 'Openings', value: String(job.openings) },
  ].filter(Boolean);

  return (
    <div className="jd-layout">
      <article className="jd-main">
        {/* ---------- header ---------- */}
        <header className="card jd-hero">
          <div className="jd-hero-top">
            <CompanyMark name={companyName} logoUrl={company?.logoUrl} size="xl" />

            <div className="jd-hero-info">
              {job.department && <span className="eyebrow">{job.department}</span>}
              <h1 className="jd-title">{job.title}</h1>
              <p className="jd-co">
                {company?.id ? <Link to={`/companies/${company.id}`}>{companyName}</Link> : companyName}
                {company?.isVerified && <span className="pill pill-good">Verified</span>}
              </p>
              <div className="job-card-meta">
                <span><IconClock size={15} /> Posted {timeAgo(job.publishedAt || job.createdAt)}</span>
                {job.views ? <span><IconUsers size={15} /> {job.views} views</span> : null}
              </div>
            </div>

            {salary && <p className="jd-pay">{salary}</p>}
          </div>

          <div className="jd-facts">
            {facts.map(({ Icon, label, value }) => (
              <div key={label} className="fact">
                <span className="fact-icon"><Icon size={18} /></span>
                <span>
                  <span className="fact-label">{label}</span>
                  <span className="fact-value">{value}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="job-card-tags jd-tags">
            {job.type && <span className="tagx">{job.type}</span>}
            {job.workMode && <span className="tagx">{job.workMode}</span>}
            {job.remoteScope && <span className="tagx">{job.remoteScope}</span>}
            {closed && <StatusPill value={job.status} />}
          </div>

          <div className="row jd-actions">
            {isSeeker && !closed && (
              <>
                <button className="btn btn-lg btn-apply" onClick={() => setApplyOpen(true)}>Apply now</button>
                <button
                  className={`btn btn-lg btn-quiet ${job.isSaved ? 'is-saved' : ''}`}
                  onClick={toggleSave}
                  aria-pressed={!!job.isSaved}
                >
                  <IconBookmark size={18} filled={!!job.isSaved} />
                  {job.isSaved ? 'Saved' : 'Save'}
                </button>
              </>
            )}
            {isOwnJob && (
              <>
                <Link className="btn btn-lg" to={`/jobs/${job.id}/edit`}>Edit job</Link>
                <Link className="btn btn-lg btn-quiet" to={`/jobs/${job.id}/applicants`}>View applicants</Link>
              </>
            )}
            {!user && !closed && <Link className="btn btn-lg" to="/login">Log in to apply</Link>}
            {closed && <p className="muted">This job is no longer accepting applications.</p>}
          </div>
        </header>

        {/* ---------- body ---------- */}
        <div className="card jd-body">
          <Sections job={job} />

          {(job.requiredSkills?.length > 0 || job.preferredSkills?.length > 0) && (
            <section className="jd-section">
              <h2 className="jd-h">Skills</h2>
              {job.requiredSkills?.length > 0 && (
                <>
                  <p className="muted small">Required</p>
                  <div className="job-card-tags">
                    {job.requiredSkills.map((s) => <span key={s} className="tagx tagx-req">{s}</span>)}
                  </div>
                </>
              )}
              {job.preferredSkills?.length > 0 && (
                <>
                  <p className="muted small jd-sub">Nice to have</p>
                  <div className="job-card-tags">
                    {job.preferredSkills.map((s) => <span key={s} className="tagx tagx-skill">{s}</span>)}
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        {user && !isOwnJob && (
          <button className="btn btn-quiet btn-sm jd-report" onClick={() => setReportOpen(true)}>
            Report this job
          </button>
        )}
      </article>

      {/* ---------- sidebar ---------- */}
      <aside className="jd-side">
        {company && (
          <div className="card">
            <h3 className="rail-title">About the company</h3>
            <p><Link to={`/companies/${company.id}`}><strong>{company.name}</strong></Link></p>
            <p className="muted small">
              {[company.industry, company.size ? `${company.size} employees` : null, company.location]
                .filter(Boolean).join(' · ')}
            </p>
            <Link className="btn btn-quiet btn-sm btn-block jd-co-link" to={`/companies/${company.id}`}>
              View company <IconArrowRight size={16} />
            </Link>
          </div>
        )}

        <div className="card">
          <h3 className="rail-title">Job details</h3>
          <dl className="kv">
            <dt>Type</dt><dd>{job.type || '—'}</dd>
            <dt>Work mode</dt><dd>{job.workMode || '—'}</dd>
            <dt>Experience</dt><dd>{job.experienceLevel || '—'}</dd>
            <dt>Openings</dt><dd>{job.openings}</dd>
            <dt>Location</dt><dd>{job.location || '—'}</dd>
            <dt>Salary</dt><dd>{salary || 'Not disclosed'}</dd>
            {job.remoteScope && <><dt>Remote</dt><dd>{job.remoteScope}</dd></>}
            <dt>Posted</dt><dd>{new Date(job.publishedAt || job.createdAt).toLocaleDateString()}</dd>
          </dl>
        </div>

        {similar.length > 0 && (
          <div className="card">
            <h3 className="rail-title">Similar jobs</h3>
            <div className="stack-sm">
              {similar.slice(0, 5).map((s) => <JobCard key={s.id} job={s} compact />)}
            </div>
            <Link className="btn btn-quiet btn-sm btn-block jd-co-link" to="/jobs">
              See all jobs <IconArrowRight size={16} />
            </Link>
          </div>
        )}
      </aside>

      {/* ---------- sticky apply bar (mobile) ---------- */}
      {isSeeker && !closed && (
        <div className="applybar">
          <div className="applybar-info">
            <strong>{job.title}</strong>
            {salary && <span className="applybar-pay">{salary}</span>}
          </div>
          <button className="btn btn-apply" onClick={() => setApplyOpen(true)}>Apply now</button>
        </div>
      )}

      <ApplyModal job={job} open={applyOpen} onClose={() => setApplyOpen(false)} />

      {/* ---------- already applied ---------- */}
      <Modal open={applied} onClose={() => setApplied(false)} title="Application sent">
        <p>Your application for <strong>{job.title}</strong> is with the employer.</p>
        <p className="muted">You will get a notification when it is viewed, shortlisted or rejected.</p>
        <div className="row">
          <Link className="btn" to="/applications">Track my applications</Link>
          <button className="btn btn-quiet" onClick={() => setApplied(false)}>Keep browsing</button>
        </div>
      </Modal>

      {/* ---------- report ---------- */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this job">
        <form onSubmit={submitReport} className="form" noValidate>
          <Field label="Reason" required htmlFor="reason">
            <Select id="reason" name="reason" value={report.reason} placeholder="Choose a reason…"
              onChange={(_, v) => setReport((r) => ({ ...r, reason: v }))} options={REPORT_REASONS} />
          </Field>
          <Field label="Details" hint="Anything that helps us act on this." htmlFor="details">
            <TextArea id="details" name="details" value={report.details}
              onChange={(_, v) => setReport((r) => ({ ...r, details: v }))} />
          </Field>
          <div className="row">
            <button className="btn">Submit report</button>
            <button type="button" className="btn btn-quiet" onClick={() => setReportOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
