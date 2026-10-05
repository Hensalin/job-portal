import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import JobCard from '../components/JobCard.jsx';
import { Skeleton, ErrorState, EmptyState } from '../components/Skeleton.jsx';

/** Public company page. No token needed - anyone can read this. */
export default function CompanyPublic() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getCompany(id);
      setCompany(data.company);
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton lines={4} height="1.4rem" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!company) return <ErrorState message="This company page is not available." />;

  const socials = company.socialLinks || {};

  return (
    <>
      <header className="card company-hero">
        {company.logoUrl && <img src={company.logoUrl} alt="" className="company-logo" />}
        <div>
          <h1>
            {company.name}
            {company.isVerified && <span className="pill pill-good">Verified</span>}
          </h1>
          <p className="muted">
            {[company.industry, company.size ? `${company.size} employees` : null,
              company.foundedYear ? `Founded ${company.foundedYear}` : null, company.location]
              .filter(Boolean).join(' · ')}
          </p>
          <div className="row wrap">
            {company.website && <a className="btn btn-quiet" href={company.website} target="_blank" rel="noreferrer noopener">Website</a>}
            {company.email && <a className="btn btn-quiet" href={`mailto:${company.email}`}>Email</a>}
            {Object.entries(socials).map(([k, v]) => (
              v && <a key={k} className="btn btn-quiet" href={v} target="_blank" rel="noreferrer noopener">{k}</a>
            ))}
          </div>
        </div>
      </header>

      {company.about && (
        <section className="card">
          <h2>About</h2>
          <p className="prewrap">{company.about}</p>
        </section>
      )}

      {company.culture && (
        <section className="card">
          <h2>Culture</h2>
          <p className="prewrap">{company.culture}</p>
        </section>
      )}

      {company.benefits?.length > 0 && (
        <section className="card">
          <h2>Benefits</h2>
          <ul className="tick-list">
            {company.benefits.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </section>
      )}

      <h2>{jobs.length} open {jobs.length === 1 ? 'role' : 'roles'}</h2>
      {jobs.length === 0 ? (
        <EmptyState icon="📭" title="No open roles right now" message="Check back soon." />
      ) : (
        <div className="list">
          {jobs.map((job) => <JobCard key={job.id} job={job} />)}
        </div>
      )}

      <p className="center"><Link to="/jobs">← Back to all jobs</Link></p>
    </>
  );
}