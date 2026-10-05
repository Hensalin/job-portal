/**
 * Job recommendation scoring.
 *
 * IMPORTANT: this is a REAL calculation over REAL fields. There is no AI and no
 * hardcoded percentage. Every point below is earned by an actual match between
 * the seeker's profile and the job, and we return the reasons so the UI can
 * show *why* something matched instead of a magic number.
 */

const norm = (s) => String(s || '').trim().toLowerCase();

const SKILL_WEIGHT = 50;
const TITLE_WEIGHT = 15;
const LOCATION_WEIGHT = 15;
const EXPERIENCE_WEIGHT = 10;
const TYPE_WEIGHT = 5;
const REMOTE_WEIGHT = 5;

/** Rough seniority ranking so "3-5 years" vs "1-3 years" can be compared. */
function experienceScore(jobLevel, seekerYears) {
  if (!jobLevel || seekerYears == null) return null;
  const floor = {
    Fresher: 0, '0-1 years': 0, '1-3 years': 1,
    '3-5 years': 3, '5-10 years': 5, '10+ years': 10,
  }[jobLevel];
  if (floor == null) return null;
  const diff = seekerYears - floor;
  if (diff < 0) return 0;          // under-qualified
  if (diff <= 2) return 1;         // sweet spot
  return 0.6;                      // over-qualified, still a partial match
}

function titleScore(jobTitle, seekerRole) {
  if (!seekerRole) return null;
  const job = norm(jobTitle);
  const want = norm(seekerRole);
  if (!job || !want) return null;
  if (job === want) return 1;
  if (job.includes(want) || want.includes(job)) return 0.8;
  // any shared significant word
  const stop = new Set(['and', 'the', 'for', 'senior', 'junior', 'at', 'in']);
  const a = new Set(job.split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2 && !stop.has(w)));
  const b = new Set(want.split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2 && !stop.has(w)));
  const shared = [...a].filter((w) => b.has(w));
  return shared.length ? 0.5 : 0;
}

function locationScore(job, profile) {
  const want = norm(profile.preferred_location || profile.location);
  if (!want) return null;
  const hay = [job.city, job.state, job.location, job.country]
    .map(norm).filter(Boolean).join(' ');
  if (!hay) return null;
  if (hay.includes(want)) return 1;
  const wantWords = want.split(/[\s,]+/).filter((w) => w.length > 2);
  const hit = wantWords.some((w) => hay.includes(w));
  return hit ? 0.6 : 0;
}

/**
 * @returns {{ score:number, reasons:string[], matchedSkills:string[],
 *             missingSkills:string[], breakdown:object }}
 */
export function scoreJob(job, profile = {}) {
  const reasons = [];
  const breakdown = {};
  let score = 0;

  // --- skills ---
  // Match case-insensitively, but return the JOB's original casing so the UI
  // can highlight the exact text it rendered.
  const mine = new Set((profile.skills || []).map(norm).filter(Boolean));
  const required = (job.required_skills || []).map((s) => String(s).trim()).filter(Boolean);
  const preferred = (job.preferred_skills || []).map((s) => String(s).trim()).filter(Boolean);
  const matchedSkills = required.filter((s) => mine.has(norm(s)));
  const missingSkills = required.filter((s) => !mine.has(norm(s)));
  const matchedPreferred = preferred.filter((s) => mine.has(norm(s)));

  if (required.length) {
    const ratio = matchedSkills.length / required.length;
    const bonus = required.length ? (matchedPreferred.length / Math.max(preferred.length, 1)) * 0.2 : 0;
    const ratioScore = Math.min(1, ratio + bonus);
    breakdown.skills = ratioScore;
    score += SKILL_WEIGHT * ratioScore;
    if (matchedSkills.length) reasons.push(`Matches ${matchedSkills.length}/${required.length} required skills`);
  } else {
    breakdown.skills = null;
  }

  // --- job title vs current/desired role ---
  const t = titleScore(job.title, profile.currentRole);
  if (t != null) {
    breakdown.title = t;
    score += TITLE_WEIGHT * t;
    if (t === 1) reasons.push(`Title matches your current role (${profile.currentRole})`);
  }

  // --- location ---
  const l = locationScore(job, profile);
  if (l != null) {
    breakdown.location = l;
    score += LOCATION_WEIGHT * l;
    if (l === 1) reasons.push(`Located in your preferred area (${profile.preferred_location || profile.location})`);
  }

  // --- experience ---
  const e = experienceScore(job.experience_level, profile.years_experience);
  if (e != null) {
    breakdown.experience = e;
    score += EXPERIENCE_WEIGHT * e;
    if (e === 1) reasons.push(`Experience level fits (${job.experience_level})`);
    else if (e === 0) reasons.push('Below your experience level');
  }

  // --- job type preference ---
  if (profile.preferred_job_type) {
    const t2 = norm(job.type) === norm(profile.preferred_job_type) ? 1 : 0;
    breakdown.jobType = t2;
    score += TYPE_WEIGHT * t2;
    if (t2) reasons.push(`Matches your preferred type (${job.type})`);
  }

  // --- remote preference ---
  if (profile.remote_preference && (job.work_mode === 'Remote' || job.remote_scope)) {
    breakdown.remote = 1;
    score += REMOTE_WEIGHT;
    reasons.push('Remote friendly');
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: finalScore,
    reasons,
    matchedSkills,
    missingSkills,
    breakdown,
  };
}

/** Ranks a list of jobs for one seeker. */
export function recommendJobs(jobs, profile) {
  return jobs
    .map((job) => ({ ...job, match: scoreJob(job, profile) }))
    .sort((a, b) => b.match.score - a.match.score);
}