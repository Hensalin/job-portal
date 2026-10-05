import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusPill, { JobStatusPill } from '../components/StatusPill.jsx';
import { SkeletonList, EmptyState, ErrorState } from '../components/Skeleton.jsx';
import { timeAgo, formatSalary } from '../components/JobCard.jsx';
import JobCard from '../components/JobCard.jsx';
import { CompanyMark, IconClock, IconUsers, IconArrowRight } from '../components/Icon.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * One screen, three very different dashboards.
 *
 * WHY SPLIT BY ROLE: a seeker wants "where are my applications", an employer
 * wants "how many people applied", an admin wants "is the site healthy".
 * Forcing one layout with `if (role === ...)` blocks scattered through it
 * becomes unreadable fast. Three components in one file keeps the routing
 * obvious while each body stays short.
 */

/**
 * A stat tile. Pass `to` to make the whole tile a link.
 *
 * WHY `value` MUST NOT CONTAIN A LINK: `to` already wraps everything in a
 * <Link>, and a <Link> inside a <Link> is invalid HTML. React warns loudly
 * about it (validateDOMNesting) and browsers "fix" it by closing the outer tag
 * early, which shreds the page layout. If a tile needs a link inside it, render
 * the value as plain text and let the tile itself be the link.
 */
function Stat({ label, value, to }) {
  const body = (
    <>
      <strong>{value}</strong>
      <span>{label}</span>
    </>
  );
  return to ? <Link className="stat" to={to}>{body}</Link> : <div className="stat">{body}</div>;
}

/* ============================== SEEKER ============================== */

function SeekerDashboard() {
  const [apps, setApps] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mine, rec] = await Promise.all([
        api.getMyApplications(),
        api.getRecommendedJobs().catch(() => ({ jobs: [] })),
      ]);
      setApps(mine.applications || []);
      setRecs((rec.jobs || []).slice(0, 4));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = apps.filter((a) => !['rejected', 'withdrawn'].includes(a.status));
  const offers = apps.filter((a) => ['offer', 'hired'].includes(a.status));

  return (
    <>
      <h1>Welcome back</h1>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && <SkeletonList count={3} />}

      {!loading && !error && (
        <>
          <div className="stats">
            <Stat label="Applications" value={apps.length} to="/applications" />
            <Stat label="In progress" value={active.length} />
            <Stat label="Offers" value={offers.length} />
            <Stat label="Recommended" value={recs.length} to="/jobs" />
          </div>

          <h2>Recent applications</h2>
          {apps.length === 0 ? (
            <EmptyState
              icon="📮" title="No applications yet"
              message="Browse jobs and apply to your first one."
              actionTo="/jobs" actionLabel="Browse jobs"
            />
          ) : (
            <div className="job-list">
              {apps.slice(0, 5).map((a) => {
                const company = a.job?.companyRef?.name || a.job?.company || 'Company';
                return (
                  <article key={a.id} className="card job-card">
                    <CompanyMark name={company} logoUrl={a.job?.companyRef?.logoUrl} size="lg" />
                    <div className="job-card-body">
                      <div className="job-card-top">
                        <div>
                          <h3 className="job-card-title">
                            <Link to={`/jobs/${a.job?.id}`}>{a.job?.title || 'Job removed'}</Link>
                          </h3>
                          <p className="job-card-co">{company}</p>
                        </div>
                        <StatusPill value={a.status} />
                      </div>
                      <div className="job-card-meta">
                        <span><IconClock size={15} /> Applied {timeAgo(a.createdAt)}</span>
                      </div>
                    </div>
                    <div className="job-card-actions">
                      <Link className="btn btn-view" to={`/jobs/${a.job?.id}`}>
                        View <IconArrowRight size={16} />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {recs.length > 0 && (
            <>
              <header className="page-head">
                <div>
                  <h2>Picked for you</h2>
                  <p className="muted">
                    Matched against your <Link to="/profile">profile skills</Link>. Add more skills for better matches.
                  </p>
                </div>
                <Link className="btn btn-quiet" to="/jobs">See all jobs</Link>
              </header>
              <div className="job-list">
                {recs.map((j) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    canApply
                    showMatch
                    match={j.matchScore}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

/* ============================= EMPLOYER ============================= */

function EmployerDashboard() {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // The endpoint returns { jobs: [...] }, not a bare array. Assigning the
      // whole response put an object in state, and the first `jobs.reduce(...)`
      // threw "reduce is not a function" - which blanked the entire employer
      // dashboard with no error message anywhere.
      const data = await api.getMyJobs();
      setJobs(Array.isArray(data) ? data : data?.jobs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.deleteJob(deleting.id);
      toast.success('Job deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (job, status) => {
    try {
      await api.setJobStatus(job.id, status);
      toast.success(`Job ${status}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const duplicate = async (job) => {
    try {
      await api.duplicateJob(job.id);
      toast.success('Job duplicated as a draft.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const totalApplicants = jobs.reduce((sum, j) => sum + (j.applicationsCount || 0), 0);
  const live = jobs.filter((j) => j.status === 'active').length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>My jobs</h1>
          <p className="muted">Post a role, then manage who applied.</p>
        </div>
        <Link className="btn" to="/post-job">Post a job</Link>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && <SkeletonList count={3} />}

      {!loading && !error && (
        <>
          <div className="stats">
            <Stat label="Total jobs" value={jobs.length} />
            <Stat label="Live" value={live} />
            <Stat label="Applicants" value={totalApplicants} />
            {/* Whole tile is the link, so the value stays plain text - see Stat. */}
      <Stat label="Company" value="Edit" to="/company" />
          </div>

          {jobs.length === 0 ? (
            <EmptyState
              icon="📢" title="You have not posted a job yet"
              message="Post your first role and candidates can apply within minutes."
              actionTo="/post-job" actionLabel="Post a job"
            />
          ) : (
            <div className="job-list">
              {jobs.map((job) => (
                <article key={job.id} className="card job-card">
                  <CompanyMark name={job.company || 'Company'} logoUrl={job.companyRef?.logoUrl} size="lg" />

                  <div className="job-card-body">
                    <div className="job-card-top">
                      <div>
                        <h3 className="job-card-title"><Link to={`/jobs/${job.id}`}>{job.title}</Link></h3>
                        <p className="job-card-co">
                          {job.location || 'No location'}
                          {job.type && ` · ${job.type}`}
                        </p>
                      </div>
                      <JobStatusPill value={job.status} />
                    </div>

                    <div className="job-card-meta">
                      <span><IconUsers size={15} /> {job.applicationsCount || 0} applicant{job.applicationsCount === 1 ? '' : 's'}</span>
                      <span><IconClock size={15} /> posted {timeAgo(job.publishedAt || job.createdAt)}</span>
                    </div>
                  </div>

                  <div className="job-card-actions">
                    <Link className="btn btn-apply" to={`/jobs/${job.id}/applicants`}>
                      Applicants ({job.applicationsCount || 0})
                    </Link>
                    <div className="row gap">
                      <Link className="btn btn-quiet btn-sm" to={`/jobs/${job.id}/edit`}>Edit</Link>
                      {job.status === 'active' ? (
                        <button className="btn btn-quiet btn-sm" onClick={() => changeStatus(job, 'paused')}>Pause</button>
                      ) : job.status === 'paused' ? (
                        <button className="btn btn-quiet btn-sm" onClick={() => changeStatus(job, 'active')}>Go live</button>
                      ) : null}
                      {job.status !== 'closed' && (
                        <button className="btn btn-quiet btn-sm" onClick={() => changeStatus(job, 'closed')}>Close</button>
                      )}
                      <button className="btn btn-quiet btn-sm" onClick={() => duplicate(job)}>Duplicate</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleting(job)}>Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={!!deleting}
        title="Delete this job?"
        message={`"${deleting?.title}" and all of its applications will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete job"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

/* ============================== ADMIN ============================== */

function AdminDashboard() {
  return (
    <>
      <h1>Admin</h1>
      <p className="muted">
        Site-wide tools live on the <Link to="/admin">admin page</Link>.
      </p>
      <div className="stats">
        <Stat label="Users" value="—" to="/admin" />
        <Stat label="Jobs" value="—" to="/admin" />
        <Stat label="Reports" value="—" to="/admin" />
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'employer') return <EmployerDashboard />;
  if (user?.role === 'admin') return <AdminDashboard />;
  return <SeekerDashboard />;
}