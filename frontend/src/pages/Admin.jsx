import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { JobStatusPill } from '../components/StatusPill.jsx';
import { SkeletonList, EmptyState, ErrorState } from '../components/Skeleton.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import { TextInput } from '../components/Field.jsx';
import { timeAgo } from '../components/JobCard.jsx';

const TABS = [
  { key: 'users',    label: 'Users' },
  { key: 'jobs',     label: 'Jobs' },
  { key: 'companies',label: 'Companies' },
  { key: 'reports',  label: 'Reports' },
];

const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'];

/**
 * Admin console.
 *
 * DESTRUCTIVE ACTIONS ARE GUARDED:
 *   - an admin cannot suspend their own account (blocked server-side too)
 *   - deleting a job asks for confirmation, because it also deletes every
 *     application for that job via ON DELETE CASCADE
 */
export default function Admin() {
  const toast = useToast();
  const [tab, setTab] = useState('users');
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  // Stats load once. A failed stats call must not block the tables below it.
  useEffect(() => {
    api.getStats().then(setStats).catch(() => setStats(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'users') {
        const d = await api.getUsers({ ...(search ? { search } : {}) });
        setRows(d.users || []);
      } else if (tab === 'jobs') {
        const d = await api.getAllJobs({ ...(statusFilter ? { status: statusFilter } : {}) });
        setRows(d.jobs || []);
      } else if (tab === 'companies') {
        const d = await api.getCompanies({
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(search ? { search } : {}),
        });
        setRows(d.companies || []);
      } else {
        const d = await api.getReports(statusFilter || 'open');
        setRows(d.reports || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const switchTab = (key) => {
    setTab(key);
    setSearch('');
    setStatusFilter('');
  };

  const toggleUser = async (u) => {
    const snapshot = rows;
    setRows((list) => list.map((x) => (x.id === u.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      await api.setUserActive(u.id, !u.isActive);
      toast.success(`${u.fullName || 'User'} ${u.isActive ? 'suspended' : 'reactivated'}.`);
    } catch (err) {
      setRows(snapshot);
      toast.error(err.message);
    }
  };

  const approveCompany = async (c, status) => {
    const snapshot = rows;
    setRows((list) => list.map((x) => (x.id === c.id ? { ...x, status } : x)));
    try {
      await api.setCompanyStatus(c.id, status);
      toast.success(`${c.name} marked ${status}.`);
    } catch (err) {
      setRows(snapshot);
      toast.error(err.message);
    }
  };

  const resolveReport = async (r, status) => {
    const snapshot = rows;
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try {
      await api.resolveReport(r.id, status);
      toast.success(`Report marked ${status}.`);
    } catch (err) {
      setRows(snapshot);
      toast.error(err.message);
    }
  };

  const confirmDeleteJob = async () => {
    setBusy(true);
    try {
      await api.adminDeleteJob(deleting.id);
      toast.success('Job and its applications deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Admin</h1>

      {/* ---------- site stats ---------- */}
      {stats && (
        <div className="stats">
          <div className="stat"><strong>{stats.users.total}</strong><span>Users</span></div>
          <div className="stat"><strong>{stats.users.seekers}</strong><span>Seekers</span></div>
          <div className="stat"><strong>{stats.users.employers}</strong><span>Employers</span></div>
          <div className="stat"><strong>{stats.jobs.total}</strong><span>Jobs</span></div>
          <div className="stat"><strong>{stats.jobs.active}</strong><span>Live jobs</span></div>
          <div className="stat"><strong>{stats.companies.total}</strong><span>Companies</span></div>
          <div className="stat"><strong>{stats.reports.open}</strong><span>Open reports</span></div>
        </div>
      )}

      {/* ---------- tabs ---------- */}
      <div className="chip-row" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`chip ${tab === t.key ? 'on' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
            {t.key === 'reports' && stats?.reports.open > 0 && ` (${stats.reports.open})`}
          </button>
        ))}
      </div>

      {/* ---------- filters ---------- */}
      <div className="search-bar">
        {tab !== 'reports' && (
          <TextInput
            name="search" value={search} placeholder={`Search ${tab}…`}
            onChange={(_, v) => setSearch(v)} aria-label={`Search ${tab}`}
          />
        )}
        {tab === 'jobs' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Job status">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        )}
        {tab === 'companies' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Company status">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        )}
        {tab === 'reports' && (
          <select value={statusFilter || 'open'} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Report status">
            {REPORT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      {loading && <SkeletonList count={4} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState icon="✅" title="Nothing here" message={`No ${tab} match this filter.`} />
      )}

      {/* ---------- users ---------- */}
      {!loading && !error && tab === 'users' && (
        <div className="list">
          {rows.map((u) => (
            <article key={u.id} className={`card row-between ${u.isActive ? '' : 'dim'}`}>
              <div>
                <h3>{u.fullName || 'Unnamed'} <span className={`role-tag role-${u.role}`}>{u.role}</span></h3>
                <p className="muted small">
                  {u.phone || 'No phone'} · joined {timeAgo(u.createdAt)}
                  {!u.emailVerified && ' · email not verified'}
                </p>
              </div>
              <button className={`btn ${u.isActive ? 'btn-danger' : 'btn-quiet'}`} onClick={() => toggleUser(u)}>
                {u.isActive ? 'Suspend' : 'Reactivate'}
              </button>
            </article>
          ))}
        </div>
      )}

      {/* ---------- jobs ---------- */}
      {!loading && !error && tab === 'jobs' && (
        <div className="list">
          {rows.map((j) => (
            <article key={j.id} className="card row-between">
              <div>
                <h3><Link to={`/jobs/${j.id}`}>{j.title}</Link></h3>
                <p className="muted small">
                  {j.company || 'No company'} · by {j.employerName || 'unknown'} · {timeAgo(j.createdAt)}
                </p>
              </div>
              <div className="row">
                <JobStatusPill value={j.status} />
                <button className="btn btn-danger" onClick={() => setDeleting(j)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ---------- companies ---------- */}
      {!loading && !error && tab === 'companies' && (
        <div className="list">
          {rows.map((c) => (
            <article key={c.id} className="card row-between">
              <div>
                <h3><Link to={`/companies/${c.id}`}>{c.name}</Link></h3>
                <p className="muted small">
                  {[c.industry, c.size ? `${c.size} employees` : null, c.location]
                    .filter(Boolean).join(' · ') || 'No details yet'}
                  {` · owner ${c.ownerName || 'unknown'}`}
                </p>
              </div>
              <div className="row">
                <span className={`pill ${c.status === 'approved' ? 'pill-good' : c.status === 'rejected' ? 'pill-bad' : 'pill-info'}`}>
                  {c.status}
                </span>
                {c.status !== 'approved' && (
                  <button className="btn btn-quiet btn-sm" onClick={() => approveCompany(c, 'approved')}>Approve</button>
                )}
                {c.status !== 'rejected' && (
                  <button className="btn btn-danger btn-sm" onClick={() => approveCompany(c, 'rejected')}>Reject</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ---------- reports ---------- */}
      {!loading && !error && tab === 'reports' && (
        <div className="list">
          {rows.map((r) => (
            <article key={r.id} className="card">
              <div className="row-between">
                <h3>{r.reason}</h3>
                <span className={`pill ${r.status === 'resolved' ? 'pill-good' : r.status === 'dismissed' ? 'pill-muted' : 'pill-info'}`}>
                  {r.status}
                </span>
              </div>
              {r.details && <p className="muted">{r.details}</p>}
              <p className="muted small">
                {r.job ? <Link to={`/jobs/${r.job.id}`}>{r.job.title}</Link> : 'Job removed'}
                {' · reported by '}{r.reporterName || 'unknown'} · {timeAgo(r.createdAt)}
              </p>
              <div className="row wrap">
                {REPORT_STATUSES.filter((s) => s !== r.status).map((s) => (
                  <button key={s} className="btn btn-quiet btn-sm" onClick={() => resolveReport(r, s)}>
                    Mark {s}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleting}
        title="Delete this job?"
        message={`"${deleting?.title}" will be deleted along with every application for it. This cannot be undone.`}
        confirmLabel="Delete job"
        danger
        busy={busy}
        onConfirm={confirmDeleteJob}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}