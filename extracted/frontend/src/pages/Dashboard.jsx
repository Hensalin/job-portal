import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

const TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract', 'Remote'];

function Status({ value }) {
  return <span className={`pill pill-${value}`}>{value}</span>;
}

/* ---------- Job seeker ---------- */
function SeekerDashboard() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getMyApplications().then(setApps).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h1>My applications</h1>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}
      {!loading && apps.length === 0 && <p className="muted">You have not applied to any jobs yet. Browse jobs to get started.</p>}
      <div className="list">
        {apps.map((a) => (
          <article key={a.id} className="card job">
            <div>
              <h2>{a.jobs?.title}</h2>
              <p className="muted">{a.jobs?.company} &middot; {a.jobs?.location}</p>
            </div>
            <Status value={a.status} />
          </article>
        ))}
      </div>
    </>
  );
}

/* ---------- Employer ---------- */
const EMPTY = { title: '', company: '', location: '', type: 'Full-time', salary: '', description: '' };

function EmployerDashboard() {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [openJob, setOpenJob] = useState(null);
  const [applicants, setApplicants] = useState([]);

  const load = () => api.getMyJobs().then(setJobs).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const post = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createJob(form);
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this job and its applications?')) return;
    try {
      await api.deleteJob(id);
      if (openJob === id) setOpenJob(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleApplicants = async (id) => {
    if (openJob === id) return setOpenJob(null);
    try {
      setApplicants(await api.getJobApplications(id));
      setOpenJob(id);
    } catch (err) {
      setError(err.message);
    }
  };

  const setStatus = async (appId, status) => {
    try {
      await api.setApplicationStatus(appId, status);
      setApplicants((list) => list.map((a) => (a.id === appId ? { ...a, status } : a)));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <h1>Post a job</h1>
      {error && <p className="error">{error}</p>}
      <form className="card form" onSubmit={post}>
        <div className="grid">
          <label>Title<input name="title" value={form.title} onChange={change} required /></label>
          <label>Company<input name="company" value={form.company} onChange={change} required /></label>
          <label>Location<input name="location" value={form.location} onChange={change} required /></label>
          <label>Type
            <select name="type" value={form.type} onChange={change}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Salary (optional)<input name="salary" value={form.salary} onChange={change} /></label>
        </div>
        <label>Description
          <textarea name="description" rows={4} value={form.description} onChange={change} required />
        </label>
        <button className="btn">Publish job</button>
      </form>

      <h1>My jobs</h1>
      {jobs.length === 0 && <p className="muted">You have not posted any jobs yet.</p>}
      <div className="list">
        {jobs.map((job) => (
          <article key={job.id} className="card">
            <div className="job">
              <div>
                <h2>{job.title}</h2>
                <p className="muted">{job.company} &middot; {job.location} &middot; {job.applications?.[0]?.count ?? 0} applicants</p>
              </div>
              <div className="row">
                <button className="btn btn-quiet" onClick={() => toggleApplicants(job.id)}>
                  {openJob === job.id ? 'Hide applicants' : 'View applicants'}
                </button>
                <button className="btn btn-danger" onClick={() => remove(job.id)}>Delete</button>
              </div>
            </div>

            {openJob === job.id && (
              <div className="applicants">
                {applicants.length === 0 && <p className="muted">No applications yet.</p>}
                {applicants.map((a) => (
                  <div key={a.id} className="applicant">
                    <div>
                      <strong>{a.profiles?.full_name}</strong>
                      {a.cover_letter && <p className="muted">{a.cover_letter}</p>}
                    </div>
                    <div className="row">
                      <Status value={a.status} />
                      <button className="btn btn-quiet" onClick={() => setStatus(a.id, 'accepted')}>Accept</button>
                      <button className="btn btn-quiet" onClick={() => setStatus(a.id, 'rejected')}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

export default function Dashboard({ user }) {
  return user.role === 'employer' ? <EmployerDashboard /> : <SeekerDashboard />;
}
