import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApplyModal from './ApplyModal.jsx';
import {
  IconMapPin, IconWallet, IconClock, IconBookmark, IconArrowRight,
  IconBriefcase, IconUsers, CompanyMark,
} from './Icon.jsx';

/**
 * Formats a salary range for display.
 *
 * Returns null when the employer chose to hide it, so callers can show
 * "Not disclosed" instead of a broken "₹0 - ₹0".
 */
export function formatSalary(job) {
  if (job.hideSalary) return null;
  const { salaryMin, salaryMax, currency = 'INR', salaryPeriod } = job;
  const sym = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[currency] || `${currency} `;

  // Indian numbering: 1,00,000 is easier to read than 100000.
  const n = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const num = Number(v);
    if (Number.isNaN(num)) return null;
    if (currency === 'INR' && num >= 100000) {
      const lakh = num / 100000;
      return `${sym}${Number.isInteger(lakh) ? lakh : lakh.toFixed(1)} L`;
    }
    return `${sym}${num.toLocaleString('en-IN')}`;
  };

  const lo = n(salaryMin);
  const hi = n(salaryMax);
  let out;
  if (lo && hi) out = `${lo} - ${hi}`;
  else if (lo) out = `${lo}+`;
  else if (hi) out = `up to ${hi}`;
  else return null;

  return salaryPeriod ? `${out} / ${salaryPeriod.replace('Per ', '').toLowerCase()}` : out;
}

/** Human "posted 3 days ago" without pulling in a date library. */
export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** True for anything posted in the last 24 hours - drives the "New" ribbon. */
export function isNew(iso) {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < 24 * 60 * 60 * 1000;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

/**
 * ONE JOB IN A LIST.
 *
 * PROPS
 *   job            the shaped job from the API
 *   onToggleSave   (job) => void - the PARENT owns save state so the list can
 *                  update optimistically. Omit it and the bookmark disappears.
 *   onApply        () => void - enables the Apply button. Omit and the card
 *                  shows "View details" only (employers, admins, logged-out).
 *   canApply       the current user is a seeker and the job is still open
 *   showMatch      render the match percentage pill
 *
 * WHY THE WHOLE CARD IS NOT A LINK: a link wrapping buttons produces nested
 * interactive elements, which breaks keyboard navigation and makes the middle
 * click open the job instead of the company. Only the title and the company
 * name are links; the actions are real buttons.
 */
export default function JobCard({
  job,
  onToggleSave,
  onApply,
  canApply = false,
  to,
  showMatch,
  match,
  compact = false,
}) {
  const target = to ?? `/jobs/${job.id}`;
  const salary = formatSalary(job);
  const companyName = job.companyRef?.name || job.company || 'Confidential';
  const postedAt = job.publishedAt || job.createdAt;
  const closed = job.status && job.status !== 'active';
  const navigate = useNavigate();
  const [applyOpen, setApplyOpen] = useState(false);

  const tags = [
    job.type,
    job.workMode,
    job.experienceLevel,
    job.department,
  ].filter(Boolean).slice(0, 3);

  return (
    <>
      <article className={`card job-card ${compact ? 'job-card-compact' : ''} ${closed ? 'is-closed' : ''}`}>
        {/* ---------- company tile ---------- */}
        <CompanyMark
          name={companyName}
          logoUrl={job.companyRef?.logoUrl}
          size={compact ? 'sm' : 'lg'}
        />

        {/* ---------- the clickable body ---------- */}
        <div className="job-card-body">
          <div className="job-card-top">
            <div>
              <h3 className="job-card-title">
                {isNew(postedAt) && !closed && <span className="ribbon-new">New</span>}
                <Link to={target}>{job.title}</Link>
              </h3>
              <p className="job-card-co">
                {job.companyRef?.id ? (
                  <Link to={`/companies/${job.companyRef.id}`}>{companyName}</Link>
                ) : companyName}
                {job.verified === true && <span className="tick" title="Verified company">✓</span>}
              </p>
            </div>

            {salary && <p className="job-card-pay">{salary}</p>}
          </div>

          <div className="job-card-meta">
            {job.location && (
              <span><IconMapPin size={15} /> {job.location}</span>
            )}
            {job.experienceLevel && (
              <span><IconBriefcase size={15} /> {job.experienceLevel}</span>
            )}
            <span><IconClock size={15} /> {timeAgo(postedAt)}</span>
            {job.applicationsCount !== undefined && (
              <span><IconUsers size={15} /> {job.applicationsCount} applied</span>
            )}
          </div>

          {!compact && tags.length > 0 && (
            <div className="job-card-tags">
              {tags.map((t) => <span key={t} className="tagx">{t}</span>)}
              {job.openings > 1 && <span className="tagx tagx-open">{job.openings} openings</span>}
            </div>
          )}

          {!compact && job.requiredSkills?.length > 0 && (
            <div className="job-card-skills">
              {job.requiredSkills.slice(0, 5).map((s) => <span key={s} className="tagx tagx-skill">{s}</span>)}
              {job.requiredSkills.length > 5 && (
                <span className="tagx tagx-more">+{job.requiredSkills.length - 5}</span>
              )}
            </div>
          )}
        </div>

        {/* ---------- actions ---------- */}
        <div className="job-card-actions">
          {showMatch && match !== undefined && <MatchPill score={match} />}

          {closed ? (
            <span className="pill pill-muted">Closed</span>
          ) : (
            <>
              {onToggleSave && (
                <button
                  className={`icon-btn ${job.isSaved ? 'on' : ''}`}
                  onClick={() => onToggleSave(job)}
                  aria-pressed={!!job.isSaved}
                  aria-label={job.isSaved ? 'Remove from saved jobs' : 'Save this job'}
                  title={job.isSaved ? 'Remove from saved jobs' : 'Save this job'}
                >
                  <IconBookmark size={20} filled={!!job.isSaved} />
                </button>
              )}

              {canApply && (onApply || onToggleSave) && (
                <button className="btn btn-apply" onClick={() => setApplyOpen(true)}>
                  Apply now
                </button>
              )}

              <button
                className="btn btn-view"
                onClick={() => navigate(target)}
              >
                View details <IconArrowRight size={16} />
              </button>
            </>
          )}
        </div>
      </article>

      {canApply && (
        <ApplyModal
          job={job}
          open={applyOpen}
          onClose={() => setApplyOpen(false)}
          onApplied={() => onApply?.()}
        />
      )}
    </>
  );
}

function MatchPill({ score }) {
  const cls = score >= 75 ? 'high' : score >= 45 ? 'mid' : 'low';
  return <span className={`match-pill ${cls}`}>{score}% match</span>;
}
