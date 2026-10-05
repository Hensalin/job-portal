import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

const TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract', 'Remote'];

export default function Jobs({ user }) {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applyingTo, setApplyingTo] = useState(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setJobs(await api.getJobs({ search, type }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [type]); // eslint-disable-line

  const onSearch = (e) => { e.preventDefault(); load(); };

  const submitApplication = async (jobId) => {
    setNotice('');
    try {
      await api.apply(jobId, coverLetter);
      setNotice('Application sent.');
      setApplyingTo(null);
      setCoverLetter('');
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <>
      <h1>Open positions</h1>
      <form className="filters" onSubmit={onSearch}>
        <input placeholder="Title, company or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn">Search</button>
      </form>

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading jobs...</p>}
      {!loading && !error && jobs.length === 0 && <p className="muted">No jobs match your search. Try a different keyword.</p>}

      <div className="list">
        {jobs.map((job) => (
          <article key={job.id} className="card job">
            <div>
              <h2>{job.title}</h2>
              <p className="muted">{job.company} &middot; {job.location} &middot; {job.type}{job.salary ? ` · ${job.salary}` : ''}</p>
              <p>{job.description}</p>
            </div>

            {user?.role === 'seeker' && (
              applyingTo === job.id ? (
                <div className="form">
                  <textarea rows={3} placeholder="Why are you a good fit? (optional)" value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} />
                  <div className="row">
                    <button className="btn" onClick={() => submitApplication(job.id)}>Send application</button>
                    <button className="btn btn-quiet" onClick={() => setApplyingTo(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn" onClick={() => setApplyingTo(job.id)}>Apply</button>
              )
            )}
            {!user && <Link to="/login" className="btn btn-quiet">Log in to apply</Link>}
          </article>
        ))}
      </div>
    </>
  );
}
