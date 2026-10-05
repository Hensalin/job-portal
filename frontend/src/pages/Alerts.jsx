import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { SkeletonList, EmptyState, ErrorState } from '../components/Skeleton.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Field, { TextInput, Select, Checkbox } from '../components/Field.jsx';
import { timeAgo } from '../components/JobCard.jsx';

const EMPTY = {
  keyword: '', location: '', experienceLevel: '', jobType: '',
  remoteOnly: false, frequency: 'daily', isActive: true,
};

/**
 * Job alerts.
 *
 * HONEST LIMITS - do not let the UI promise more than the backend delivers:
 *   - `frequency` is stored and shown, but nothing emails you. New matches
 *     appear in your in-app notifications. There is no email provider
 *     configured, so the copy says "in-app" everywhere.
 *   - "Run now" only creates notifications; it does not schedule anything.
 */
export default function Alerts() {
  const toast = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAlerts();
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const change = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  const create = async (e) => {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      await api.createAlert({
        keyword: form.keyword.trim() || undefined,
        location: form.location.trim() || undefined,
        experienceLevel: form.experienceLevel || undefined,
        jobType: form.jobType || undefined,
        remoteOnly: form.remoteOnly,
        frequency: form.frequency,
        isActive: form.isActive,
      });
      toast.success('Alert created.');
      setForm(EMPTY);
      load();
    } catch (err) {
      if (err.details) setErrors(err.details);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a) => {
    setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, is_active: !x.is_active } : x)));
    try {
      await api.updateAlert(a.id, { isActive: !a.is_active });
    } catch (err) {
      setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, is_active: a.is_active } : x)));
      toast.error(err.message);
    }
  };

  const runNow = async (a) => {
    try {
      const data = await api.runAlert(a.id);
      toast.success(data.matched ? `${data.matched} matching job(s) sent to your notifications.` : 'No new matches right now.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.deleteAlert(deleting.id);
      toast.success('Alert deleted.');
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
      <h1>Job alerts</h1>
      <p className="muted">
        Save a search and we will check it for new jobs. Matches show up in your{' '}
        <Link to="/notifications">notifications</Link>.
      </p>

      <form className="card form" onSubmit={create} noValidate>
        <h2>New alert</h2>

        <div className="grid">
          <Field label="Keyword" error={errors.keyword} hint="A word in the title or description." htmlFor="keyword">
            <TextInput name="keyword" value={form.keyword} onChange={change} error={errors.keyword} placeholder="React developer" />
          </Field>

          <Field label="Location" error={errors.location} htmlFor="location">
            <TextInput name="location" value={form.location} onChange={change} error={errors.location} placeholder="Bengaluru" />
          </Field>

          <Field label="Experience level" error={errors.experienceLevel} htmlFor="experienceLevel">
            <Select name="experienceLevel" value={form.experienceLevel} placeholder="Any"
              onChange={change} error={errors.experienceLevel}
              options={['Fresher', '0-1 years', '1-3 years', '3-5 years', '5-10 years', '10+ years']} />
          </Field>

          <Field label="Job type" error={errors.jobType} htmlFor="jobType">
            <Select name="jobType" value={form.jobType} placeholder="Any"
              onChange={change} error={errors.jobType}
              options={['Full-time', 'Part-time', 'Internship', 'Contract', 'Freelance', 'Temporary', 'Remote']} />
          </Field>

          <Field label="Check frequency" error={errors.frequency} htmlFor="frequency">
            <Select name="frequency" value={form.frequency} onChange={change} error={errors.frequency}
              options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} />
          </Field>
        </div>

        <Checkbox name="remoteOnly" checked={form.remoteOnly} onChange={change} label="Remote jobs only" />

        <button className="btn" disabled={saving}>{saving ? 'Creating…' : 'Create alert'}</button>
      </form>

      <h2>Your alerts</h2>

      {loading && <SkeletonList count={2} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && alerts.length === 0 && (
        <EmptyState icon="🔔" title="No alerts yet" message="Create one above to get notified when matching jobs are posted." />
      )}

      <div className="list">
        {alerts.map((a) => (
          <article key={a.id} className={`card ${a.is_active ? '' : 'dim'}`}>
            <div>
              <h3>
                {a.keyword || 'Any keyword'}
                {a.location && ` in ${a.location}`}
              </h3>
              <p className="muted small">
                {[a.experience_level, a.job_type, a.remote_only ? 'Remote only' : null, a.frequency]
                  .filter(Boolean).join(' · ')}
              </p>
              {a.last_sent_at && <p className="muted small">Last checked {timeAgo(a.last_sent_at)}</p>}
            </div>

            <div className="row">
              <span className={`pill ${a.is_active ? 'pill-good' : 'pill-muted'}`}>
                {a.is_active ? 'Active' : 'Paused'}
              </span>
              <button className="btn btn-quiet" onClick={() => runNow(a)}>Run now</button>
              <button className="btn btn-quiet" onClick={() => toggleActive(a)}>
                {a.is_active ? 'Pause' : 'Resume'}
              </button>
              <button className="btn btn-danger" onClick={() => setDeleting(a)}>Delete</button>
            </div>
          </article>
        ))}
      </div>

      <ConfirmModal
        open={!!deleting}
        title="Delete this alert?"
        message="You will stop being notified about these jobs."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}