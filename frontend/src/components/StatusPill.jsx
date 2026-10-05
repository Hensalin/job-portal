/** The 9 hiring-pipeline states, with a colour per state. */
const STATUSES = {
  applied:    { label: 'Applied',     cls: 'neutral' },
  viewed:     { label: 'Viewed',      cls: 'info' },
  shortlisted:{ label: 'Shortlisted', cls: 'good' },
  interview:  { label: 'Interview',   cls: 'good' },
  assessment: { label: 'Assessment',  cls: 'info' },
  offer:      { label: 'Offer',       cls: 'great' },
  hired:      { label: 'Hired',       cls: 'great' },
  rejected:   { label: 'Rejected',    cls: 'bad' },
  withdrawn:  { label: 'Withdrawn',   cls: 'muted' },
};

export const STATUS_KEYS = Object.keys(STATUSES);

/** States an employer may move an application TO. Terminal ones are excluded. */
export const HIRING_STATUSES = ['applied', 'viewed', 'shortlisted', 'interview', 'assessment', 'offer', 'hired', 'rejected'];

export default function StatusPill({ value }) {
  const s = STATUSES[value] || { label: value || 'unknown', cls: 'neutral' };
  return <span className={`pill pill-${s.cls}`}>{s.label}</span>;
}

/** Coloured pill for a job's own lifecycle (draft/active/paused/closed). */
export function JobStatusPill({ value }) {
  const map = {
    draft:  { label: 'Draft',  cls: 'muted' },
    active: { label: 'Live',   cls: 'good' },
    paused: { label: 'Paused', cls: 'info' },
    closed: { label: 'Closed', cls: 'bad' },
  };
  const s = map[value] || { label: value || 'unknown', cls: 'neutral' };
  return <span className={`pill pill-${s.cls}`}>{s.label}</span>;
}