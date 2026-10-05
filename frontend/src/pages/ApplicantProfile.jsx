import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { Skeleton, ErrorState } from '../components/Skeleton.jsx';

/**
 * A candidate's public profile, shown to an employer.
 *
 * This endpoint never returns email, phone, or expected salary - the backend
 * picks the fields. So nothing private can leak through this screen even if
 * the component asked for it.
 */
export default function ApplicantProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProfile(await api.getPublicProfile(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton lines={5} height="1.3rem" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return <ErrorState message="That profile is not available." />;

  const p = profile.profile || profile;

  return (
    <>
      <header className="card">
        <h1>{p.fullName}</h1>
        {p.headline && <p className="muted">{p.headline}</p>}
        <p className="muted small">
          {[p.currentRole, p.location, p.yearsExperience ? `${p.yearsExperience} years experience` : null]
            .filter(Boolean).join(' · ')}
        </p>
        {p.skills?.length > 0 && (
          <div className="badges">
            {p.skills.map((s) => <span key={s} className="badge">{s}</span>)}
          </div>
        )}
      </header>

      {p.about && (
        <section className="card">
          <h2>About</h2>
          <p className="prewrap">{p.about}</p>
        </section>
      )}

      {p.experience?.length > 0 && (
        <section className="card">
          <h2>Experience</h2>
          <ul className="plain section-list">
            {p.experience.map((x) => (
              <li key={x.id}>
                <div className="section-body">
                  <strong>{x.title}</strong> <span className="muted">at {x.company}</span>
                  <span className="muted small">
                    {' '}
                    {x.start_date?.slice(0, 7)} → {x.is_current ? 'Present' : x.end_date?.slice(0, 7) || '—'}
                    {x.location && ` · ${x.location}`}
                  </span>
                  {x.description && <p className="muted small prewrap">{x.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.education?.length > 0 && (
        <section className="card">
          <h2>Education</h2>
          <ul className="plain section-list">
            {p.education.map((x) => (
              <li key={x.id}>
                <div className="section-body">
                  <strong>{x.degree || x.institution}</strong>
                  {x.degree && <span className="muted"> · {x.institution}</span>}
                  <span className="muted small">
                    {' '}
                    {[x.field_of_study, x.start_year, x.end_year && `– ${x.end_year}`, x.grade]
                      .filter(Boolean).join(' · ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.certifications?.length > 0 && (
        <section className="card">
          <h2>Certifications</h2>
          <ul className="plain section-list">
            {p.certifications.map((x) => (
              <li key={x.id}>
                <div className="section-body">
                  <strong>{x.name}</strong>
                  {x.issuer && <span className="muted"> · {x.issuer}</span>}
                  {x.issued_on && <span className="muted small"> · {x.issued_on}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(p.portfolio || p.linkedin || p.github || p.website) && (
        <section className="card">
          <h2>Links</h2>
          <div className="row wrap">
            {[['Portfolio', p.portfolio], ['LinkedIn', p.linkedin], ['GitHub', p.github], ['Website', p.website]]
              .filter(([, url]) => url)
              .map(([label, url]) => (
                <a key={label} className="btn btn-quiet" href={url} target="_blank" rel="noreferrer noopener">
                  {label}
                </a>
              ))}
          </div>
        </section>
      )}

      <p className="center"><Link to="/jobs">← Back to jobs</Link></p>
    </>
  );
}