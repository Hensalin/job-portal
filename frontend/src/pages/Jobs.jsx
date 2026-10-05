import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import JobCard from '../components/JobCard.jsx';
import Pagination from '../components/Pagination.jsx';
import { SkeletonList, EmptyState, ErrorState } from '../components/Skeleton.jsx';
import { Select, Checkbox } from '../components/Field.jsx';
import { IconSearch, IconMapPin, IconSliders, IconX, IconSparkle } from '../components/Icon.jsx';

const PAGE_SIZE = 10;

/** Filters whose value means "not filtering". Sent only when they are set. */
const BLANK = {
  search: '', location: '', type: '', workMode: '', experienceLevel: '',
  salaryMin: '', salaryMax: '', skill: '', datePosted: '', sort: 'newest',
  remoteOnly: false,
};

/**
 * One-tap filters. Each one just sets one URL param, so the chip row and the
 * advanced panel can never disagree about what is active - both read the URL.
 */
const QUICK = [
  { label: 'Remote', Icon: null, on: { remoteOnly: true } },
  { label: 'Full-time', Icon: null, on: { type: 'Full-time' } },
  { label: 'Fresher', Icon: null, on: { experienceLevel: 'Fresher' } },
  { label: 'Part-time', Icon: null, on: { type: 'Part-time' } },
  { label: 'Internship', Icon: null, on: { type: 'Internship' } },
  { label: 'Contract', Icon: null, on: { type: 'Contract' } },
  { label: 'Work from home', Icon: null, on: { workMode: 'Remote' } },
];

/**
 * THE JOBS LIST - the most important screen in the product.
 *
 * THE URL IS THE STATE. Filters live in `?search=react&type=Full-time`, not in
 * React state. That is deliberate:
 *   - you can share the filtered list with someone
 *   - the back button works
 *   - a refresh keeps your filters
 * Reading state from the URL is what makes that possible.
 *
 * LAYOUT: a filter rail on the left (desktop) and a slide-up sheet (mobile).
 * A long column of dropdowns above the results pushes the first job off-screen,
 * which is why the rail exists rather than more rows in the search bar.
 */
export default function Jobs() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState('all'); // all | recommended
  const [appliedIds, setAppliedIds] = useState(new Set());

  // Filters come from the URL, so this object is always in sync with the bar.
  const filters = useMemo(() => {
    const out = { ...BLANK };
    for (const k of Object.keys(BLANK)) {
      const v = params.get(k);
      if (v !== null) out[k] = k === 'remoteOnly' ? v === 'true' : v;
    }
    return out;
  }, [params]);

  const page = Number(params.get('page') || 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = { ...filters, page, limit: PAGE_SIZE };
      for (const k of Object.keys(query)) {
        if (query[k] === '' || query[k] === undefined || query[k] === false) delete query[k];
      }
      const data = await api.getJobs(query);
      setJobs(data.jobs || []);
      setMeta({
        page: data.page || 1,
        totalPages: data.totalPages || 1,
        total: data.total ?? (data.jobs || []).length,
      });
    } catch (err) {
      setError(err.message);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.getJobOptions()
      .then(setOptions)
      .catch(() => setOptions(null));   // filters just fall back to free text
  }, []);

  // Which of these jobs the seeker already applied to, so the card can say
  // "Applied" instead of offering an Apply button that would 409.
  useEffect(() => {
    if (user?.role !== 'seeker' || jobs.length === 0) return;
    let cancelled = false;
    api.getMyApplications()
      .then((d) => {
        if (cancelled) return;
        const live = (d.applications || [])
          .filter((a) => !['rejected', 'withdrawn'].includes(a.status))
          .map((a) => a.job?.id)
          .filter(Boolean);
        setAppliedIds(new Set(live));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, jobs.length]);

  /** Writing a filter must always reset to page 1, or you land on page 7 of nothing. */
  const setFilter = (name, value) => {
    const next = new URLSearchParams(params);
    if (value === '' || value === false || value === undefined || value === 'newest') next.delete(name);
    else next.set(name, String(value));
    next.delete('page');
    setParams(next, { replace: true });
  };

  const goToPage = (p) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete('page');
    else next.set('page', String(p));
    setParams(next);
  };

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const activeCount = Object.entries(filters)
    .filter(([k, v]) => k !== 'sort' && v !== '' && v !== false).length;

  const isQuickOn = (chip) => Object.entries(chip.on).every(([k, v]) => filters[k] === v);

  const toggleQuick = (chip) => {
    const next = new URLSearchParams(params);
    const turnOff = isQuickOn(chip);
    for (const [k, v] of Object.entries(chip.on)) {
      if (turnOff) next.delete(k);
      else next.set(k, String(v));
    }
    next.delete('page');
    setParams(next, { replace: true });
  };

  const toggleSave = async (job) => {
    setSavingId(job.id);
    const wasSaved = job.isSaved;
    // Optimistic: the star flips instantly, and we roll back if the server says no.
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, isSaved: !wasSaved } : j)));
    try {
      if (wasSaved) { await api.unsaveJob(job.id); toast.info('Removed from saved jobs.'); }
      else { await api.saveJob(job.id); toast.success('Saved. Find it under Saved Jobs.'); }
    } catch (err) {
      setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, isSaved: wasSaved } : j)));
      toast.error(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const loadRecommended = async () => {
    setTab('recommended');
    setLoading(true);
    setError('');
    try {
      const data = await api.getRecommendedJobs();
      setJobs(data.jobs || []);
      setMeta({ page: 1, totalPages: 1, total: (data.jobs || []).length });
      clearAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showSave = user?.role === 'seeker';
  const canApply = user?.role === 'seeker';

  /* ---------------------------------------------------------------- filters */
  const filterPanel = (
    <div className="rail">
      <div className="rail-head">
        <h2 className="rail-title">Filters</h2>
        {activeCount > 0 && (
          <button className="link-btn" onClick={clearAll}>Clear all</button>
        )}
      </div>

      <div className="rail-group">
        <label className="rail-label" htmlFor="f-sort">Sort by</label>
        <Select id="f-sort" name="sort" value={filters.sort} onChange={(_, v) => setFilter('sort', v)}
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'relevance', label: 'Most relevant' },
            { value: 'salary', label: 'Highest salary' },
          ]} />
      </div>

      <div className="rail-group">
        <label className="rail-label" htmlFor="f-type">Job type</label>
        <Select id="f-type" name="type" value={filters.type} placeholder="Any type"
          onChange={(_, v) => setFilter('type', v)}
          options={options?.types || ['Full-time', 'Part-time', 'Internship', 'Contract', 'Freelance', 'Temporary', 'Remote']} />
      </div>

      <div className="rail-group">
        <label className="rail-label" htmlFor="f-mode">Work mode</label>
        <Select id="f-mode" name="workMode" value={filters.workMode} placeholder="Any"
          onChange={(_, v) => setFilter('workMode', v)}
          options={options?.workModes || ['On-site', 'Hybrid', 'Remote']} />
      </div>

      <div className="rail-group">
        <label className="rail-label" htmlFor="f-exp">Experience</label>
        <Select id="f-exp" name="experienceLevel" value={filters.experienceLevel} placeholder="Any"
          onChange={(_, v) => setFilter('experienceLevel', v)}
          options={options?.experienceLevels || ['Fresher', '0-1 years', '1-3 years', '3-5 years', '5-10 years', '10+ years']} />
      </div>

      <div className="rail-group">
        <label className="rail-label" htmlFor="f-posted">Date posted</label>
        <Select id="f-posted" name="datePosted" value={filters.datePosted} placeholder="Any time"
          onChange={(_, v) => setFilter('datePosted', v)}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'Last 7 days' },
            { value: 'month', label: 'Last 30 days' },
          ]} />
      </div>

      <div className="rail-group">
        <span className="rail-label">Salary (₹ per year)</span>
        <div className="rail-pair">
          <input
            aria-label="Minimum salary" type="number" min="0" placeholder="Min"
            value={filters.salaryMin}
            onChange={(e) => setFilter('salaryMin', e.target.value)}
          />
          <span className="rail-dash">–</span>
          <input
            aria-label="Maximum salary" type="number" min="0" placeholder="Max"
            value={filters.salaryMax}
            onChange={(e) => setFilter('salaryMax', e.target.value)}
          />
        </div>
      </div>

      <div className="rail-group">
        <label className="rail-label" htmlFor="f-skill">Skill</label>
        <input
          id="f-skill" name="skill" placeholder="e.g. React" value={filters.skill}
          onChange={(e) => setFilter('skill', e.target.value)}
        />
      </div>

      <Checkbox name="remoteOnly" checked={filters.remoteOnly}
        onChange={(_, v) => setFilter('remoteOnly', v)} label="Remote jobs only" />
    </div>
  );

  return (
    <>
      {/* ---------- hero search ---------- */}
      <section className="hero">
        <div className="hero-inner">
          <h1 className="hero-title">
            {tab === 'recommended' ? 'Picked for you' : 'Find your next job'}
          </h1>
          <p className="hero-sub">
            {tab === 'recommended'
              ? 'Matched against your profile skills.'
              : 'Search thousands of openings and apply in one tap.'}
          </p>

          <form className="hero-search" onSubmit={(e) => e.preventDefault()}>
            <div className="hs-field">
              <IconSearch size={19} />
              <input
                name="search" value={filters.search} placeholder="Job title, skill or company"
                aria-label="Search jobs"
                onChange={(e) => setFilter('search', e.target.value)}
              />
            </div>
            <div className="hs-field">
              <IconMapPin size={19} />
              <input
                name="location" value={filters.location} placeholder="City"
                aria-label="Location"
                onChange={(e) => setFilter('location', e.target.value)}
              />
            </div>
            <button className="btn btn-lg hs-btn" type="submit">Search</button>
          </form>

          <div className="hero-tags">
            <span className="hero-tags-label">Popular:</span>
            {['React', 'Fresher', 'Remote', 'Full-time', 'Bengaluru'].map((t) => (
              <button key={t} className="hero-tag" onClick={() => setFilter('search', t)}>{t}</button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- quick filter chips ---------- */}
      <div className="qbar">
        {user?.role === 'seeker' && (
          <button
            className={`qchip qchip-ai ${tab === 'recommended' ? 'on' : ''}`}
            onClick={() => (tab === 'recommended' ? (setTab('all'), load()) : loadRecommended())}
          >
            <IconSparkle size={16} /> For you
          </button>
        )}
        {QUICK.map((q) => (
          <button
            key={q.label}
            className={`qchip ${isQuickOn(q) ? 'on' : ''}`}
            onClick={() => toggleQuick(q)}
            aria-pressed={isQuickOn(q)}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* ---------- layout: rail + results ---------- */}
      <div className="jobs-layout">
        <aside className="jobs-rail">{filterPanel}</aside>

        <div className="jobs-results">
          <div className="results-head">
            <div>
              <h2 className="results-count">
                {loading ? 'Searching…' : `${meta.total} ${meta.total === 1 ? 'job' : 'jobs'}`}
                {tab !== 'recommended' && activeCount > 0 && (
                  <span className="results-filtered"> · {activeCount} filter{activeCount === 1 ? '' : 's'}</span>
                )}
              </h2>
              {!user && !loading && <p className="muted small">Log in to save jobs and apply faster.</p>}
            </div>

            {/* Mobile: filters live in a bottom sheet, not a rail. */}
            <button className="btn btn-quiet rail-toggle" onClick={() => setSheetOpen(true)}>
              <IconSliders size={18} /> Filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </button>
          </div>

          {loading && <SkeletonList count={5} />}
          {!loading && error && <ErrorState message={error} onRetry={load} />}
          {!loading && !error && jobs.length === 0 && (
            <EmptyState
              icon="🔍"
              title={tab === 'recommended' ? 'No recommendations yet' : 'No jobs matched'}
              message={
                activeCount > 0
                  ? 'Try removing a filter or using a broader keyword.'
                  : tab === 'recommended'
                    ? 'Add skills and a job title to your profile to get matched.'
                    : 'There are no active jobs right now. Check back soon.'
              }
              actionTo="/profile"
              actionLabel="Update my profile"
            />
          )}

          <div className="job-list">
            {jobs.map((job) => (
              <div key={job.id} style={{ opacity: savingId === job.id ? 0.6 : 1 }}>
                <JobCard
                  job={job}
                  onToggleSave={showSave ? toggleSave : undefined}
                  canApply={canApply && !appliedIds.has(job.id)}
                  onApply={() => setAppliedIds((s) => new Set(s).add(job.id))}
                  showMatch={tab === 'recommended'}
                  match={job.matchScore}
                />
              </div>
            ))}
          </div>

          {!loading && tab !== 'recommended' && (
            <Pagination page={meta.page} totalPages={meta.totalPages} onChange={goToPage} />
          )}
        </div>
      </div>

      {/* ---------- mobile filter sheet ---------- */}
      {sheetOpen && (
        <>
          <div className="sheet-scrim" onClick={() => setSheetOpen(false)} />
          <div className="sheet" role="dialog" aria-label="Filters">
            <div className="sheet-head">
              <strong>Filters</strong>
              <button className="icon-btn" onClick={() => setSheetOpen(false)} aria-label="Close filters">
                <IconX size={22} />
              </button>
            </div>
            <div className="sheet-body">{filterPanel}</div>
            <div className="sheet-foot">
              <button className="btn btn-block" onClick={() => setSheetOpen(false)}>
                Show {meta.total} {meta.total === 1 ? 'job' : 'jobs'}
              </button>
            </div>
          </div>
        </>
      )}

      {!user && !loading && jobs.length > 0 && (
        <p className="muted center signin-nudge">
          <Link to="/login">Log in</Link> to save jobs and apply.
        </p>
      )}
    </>
  );
}
