import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import StatusPill, { STATUS_KEYS } from '../components/StatusPill.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import { SkeletonList, EmptyState, ErrorState } from '../components/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { timeAgo } from '../components/JobCard.jsx';
import { CompanyMark, IconClock, IconFile, IconArrowRight } from '../components/Icon.jsx';

/**
 * Every field on this screen is CAMEL CASE and nested under `job`.
 *
 * WHY: `applicationService.shapeApplication` reshapes each row before it is
 * sent, so `cover_letter` arrives as `coverLetter` and `expected_salary` as
 * `expectedSalary`. The job is under `a.job`, NOT `a.jobs`, and the company
 * is under `a.job.companyRef`.
 *
 * This is the single easiest thing to get wrong here, so it is written out
 * rather than guessed at.
 */
const NEXT_STEP = {
  applied:     'Waiting for the employer to open your application.',
  viewed:      'The employer has opened your application.',
  shortlisted: 'You are on the shortlist. Expect contact soon.',
  interview:   'An interview is being scheduled.',
  assessment:  'You may get a skills test.',
  offer:       'An offer has been made.',
  hired:       'Congratulations, you got the job.',
  rejected:    'Not this time. Keep applying.',
  withdrawn:   'You withdrew this application.',
};

export default function MyApplications() {
  const toast = useToast();
  const [apps, setApps] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [withdrawing, setWithdrawing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // No page param: this endpoint returns the candidate's full history.
      const data = await api.getMyApplications(status);
      setApps(data.applications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  /** The list endpoint has no answers or interviews, so fetch them on demand. */
  const openDetail = async (app) => {
    setOpenId(app.id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await api.getApplication(app.id));
    } catch (err) {
      toast.error(err.message);
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmWithdraw = async () => {
    setBusy(true);
    try {
      await api.withdrawApplication(withdrawing.id);
      toast.success('Application withdrawn.');
      setWithdrawing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const counts = apps.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <h1>My applications</h1>
      <p className="muted">Every job you applied to, and where each one stands.</p>

      <div className="chip-row" role="group" aria-label="Filter by status">
        <button className={`chip ${status === '' ? 'on' : ''}`} onClick={() => setStatus('')}>
          All ({apps.length})
        </button>
        {STATUS_KEYS.map((s) => (
          <button
            key={s}
            className={`chip ${status === s ? 'on' : ''}`}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
          >
            {s} {counts[s] ? `(${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {loading && <SkeletonList count={3} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && apps.length === 0 && (
        <EmptyState
          icon="📮"
          title={status ? `No ${status} applications` : 'You have not applied to anything yet'}
          message={status ? 'Try the "All" tab to see everything.' : 'Find a role that fits and send your application.'}
          actionTo="/jobs"
          actionLabel="Browse jobs"
        />
      )}

      <div className="job-list">
        {apps.map((a) => {
          const job = a.job || {};
          const company = job.companyRef?.name || job.company || 'Company';
          const canWithdraw = ['applied', 'viewed'].includes(a.status);
          return (
            <article key={a.id} className="card job-card">
              <CompanyMark name={company} logoUrl={job.companyRef?.logoUrl} size="lg" />

              <div className="job-card-body">
                <div className="job-card-top">
                  <div>
                    <h3 className="job-card-title">
                      {job.id ? <Link to={`/jobs/${job.id}`}>{job.title || 'Job removed'}</Link> : 'Job removed'}
                    </h3>
                    <p className="job-card-co">
                      {company}
                      {job.location && <> · {job.location}</>}
                    </p>
                  </div>
                  <StatusPill value={a.status} />
                </div>

                <p className="small muted">{NEXT_STEP[a.status]}</p>

                <div className="job-card-meta">
                  <span><IconClock size={15} /> Applied {timeAgo(a.createdAt)}</span>
                  {a.resumeName && <span><IconFile size={15} /> {a.resumeName}</span>}
                </div>
              </div>

              <div className="job-card-actions">
                <button className="btn btn-view" onClick={() => openDetail(a)}>
                  View details <IconArrowRight size={16} />
                </button>
                {canWithdraw && (
                  <button className="btn btn-danger" onClick={() => setWithdrawing(a)}>Withdraw</button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* ---------- detail ---------- */}
      <Modal
        open={!!openId}
        onClose={() => setOpenId(null)}
        title={detail?.job?.title || 'Application'}
      >
        {detailLoading && <p className="muted">Loading…</p>}

        {detail && (
          <>
            <dl className="kv">
              <dt>Status</dt><dd><StatusPill value={detail.status} /></dd>
              <dt>Applied</dt><dd>{new Date(detail.createdAt).toLocaleString()}</dd>
              <dt>Last update</dt><dd>{timeAgo(detail.updatedAt)}</dd>
              <dt>Expected salary</dt><dd>{detail.expectedSalary || '—'}</dd>
              <dt>Notice period</dt><dd>{detail.noticePeriod || '—'}</dd>
              <dt>Current location</dt><dd>{detail.currentLocation || '—'}</dd>
              <dt>Resume</dt><dd>{detail.resumeName || 'No resume attached'}</dd>
            </dl>

            {detail.coverLetter && (
              <>
                <h3>Your cover letter</h3>
                <p className="prewrap">{detail.coverLetter}</p>
              </>
            )}

            {detail.answers?.length > 0 && (
              <>
                <h3>Your answers</h3>
                <dl className="kv">
                  {detail.answers.map((ans) => (
                    <div key={ans.id} className="kv-pair">
                      <dt>{ans.question}</dt>
                      <dd>{String(ans.answer ?? '—')}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            <h3>Interviews</h3>
            {!detail.interviews?.length && (
              <p className="muted small">Nothing scheduled yet.</p>
            )}
            {detail.interviews?.length > 0 && (
              <ul className="plain">
                {detail.interviews.map((iv) => (
                  <li key={iv.id}>
                    <strong>{new Date(iv.scheduledAt).toLocaleString()}</strong> · {iv.type}
                    {iv.meetingLink && (
                      <> · <a href={iv.meetingLink} target="_blank" rel="noreferrer noopener">Join call</a></>
                    )}
                    {iv.location && ` · ${iv.location}`}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Modal>

      <ConfirmModal
        open={!!withdrawing}
        title="Withdraw application?"
        message="The employer will no longer see this application. You can apply again while the job is open."
        confirmLabel="Withdraw"
        danger
        busy={busy}
        onConfirm={confirmWithdraw}
        onClose={() => setWithdrawing(null)}
      />
    </>
  );
}