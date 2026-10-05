/**
 * Client-side validation.
 *
 * WHY THIS EXISTS: to show errors instantly without a round trip.
 * WHY IT IS NOT ENOUGH: a browser is not a security boundary. Anyone can call
 * the API directly, so the SAME rules run again in backend/utils/validators.js.
 * Never treat passing this as permission to skip the backend.
 *
 * Keep the two files in sync. If you add a rule here, add it there too.
 */

export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function validateEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email is required.' };
  const at = email.indexOf('@');
  if (at < 0) return { ok: false, error: 'Enter a valid email address.' };
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return { ok: false, error: 'Enter a valid email address.' };
  if (!local || local.startsWith('.') || local.endsWith('.') || local.includes('..'))
    return { ok: false, error: 'Enter a valid email address.' };
  if (email.includes(' ')) return { ok: false, error: 'Enter a valid email address.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  return { ok: true, value: email };
}

export function validatePassword(raw) {
  const pw = String(raw ?? '');
  if (!pw) return { ok: false, error: 'Password is required.' };
  if (pw.length < 8) return { ok: false, error: 'At least 8 characters.' };
  if (!/[A-Z]/.test(pw)) return { ok: false, error: 'Add an uppercase letter.' };
  if (!/[a-z]/.test(pw)) return { ok: false, error: 'Add a lowercase letter.' };
  if (!/\d/.test(pw)) return { ok: false, error: 'Add a number.' };
  return { ok: true, value: pw };
}

export function validateFullName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Full name is required.' };
  if (name.length < 2) return { ok: false, error: 'Too short.' };
  return { ok: true, value: name };
}

/**
 * A phone number is OPTIONAL, matching the hint under the field and the
 * backend's validatePhone. Callers that only run this when a value is present
 * still get the right answer; a blank field must never produce an error.
 */
export function validatePhone(raw) {
  const phone = String(raw ?? '').trim();
  if (!phone) return { ok: true, value: null };
  const digits = phone.replace(/\D/g, '');
  if (!/^\+?[\d\s()-]{7,20}$/.test(phone) || digits.length < 7 || digits.length > 15)
    return { ok: false, error: 'Enter a valid phone number.' };
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
    : digits.length === 10 ? digits : null;
  if (national && !/^[6-9]/.test(national))
    return { ok: false, error: 'Enter a valid mobile number (starts 6-9).' };
  return { ok: true, value: phone };
}

export function validateUrl(raw, label = 'Link') {
  const v = String(raw ?? '').trim();
  if (!v) return { ok: true, value: null };
  try {
    const u = new URL(v);
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, error: `${label} must start with http://` };
    return { ok: true, value: u.toString() };
  } catch { return { ok: false, error: `${label} must be a valid URL.` }; }
}

export function validateRequired(raw, label = 'This field') {
  const v = String(raw ?? '').trim();
  if (!v) return { ok: false, error: `${label} is required.` };
  return { ok: true, value: v };
}

/**
 * Live password strength for the register form.
 *
 * Returns `key` and `pct` because the stylesheet defines `.meter-weak` and
 * `.meter-fair` and the bar needs a percentage width. It previously returned
 * only { checks, score, all }, so the component read `strength.key` and
 * `strength.pct` as undefined - producing class "meter-undefined" and
 * width "undefined%". The bar rendered as a flat grey line and the hint read
 * "Strength: undefined".
 */
export function passwordStrength(pw) {
  const checks = [
    { label: '8+ characters', pass: pw.length >= 8 },
    { label: 'Uppercase', pass: /[A-Z]/.test(pw) },
    { label: 'Lowercase', pass: /[a-z]/.test(pw) },
    { label: 'Number', pass: /\d/.test(pw) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const all = score === checks.length;

  // weak -> fair -> good. Only three bands, because only three classes exist.
  const key = all ? 'good' : score >= 3 ? 'fair' : 'weak';

  return {
    checks,
    score,
    all,
    key,
    pct: Math.round((score / checks.length) * 100),
    label: all ? 'Strong' : score >= 3 ? 'Fair' : 'Weak',
  };
}

export function validateJobForm(values) {
  const errors = {};
  const e = (f, m) => { if (!errors[f]) errors[f] = m; };

  if (!String(values.title || '').trim()) e('title', 'Job title is required.');
  else if (String(values.title).trim().length < 2) e('title', 'Title is too short.');

  if (!String(values.description || '').trim()) e('description', 'Description is required.');
  else if (String(values.description).trim().length < 20)
    e('description', 'Please write at least 20 characters so candidates understand the role.');

  if (!values.type) e('type', 'Choose an employment type.');

  if (!values.hide_salary) {
    const min = values.salary_min === '' ? null : Number(values.salary_min);
    const max = values.salary_max === '' ? null : Number(values.salary_max);
    if (min === null || Number.isNaN(min)) e('salary_min', 'Enter a minimum salary, or tick "Hide salary".');
    if (max === null || Number.isNaN(max)) e('salary_max', 'Enter a maximum salary, or tick "Hide salary".');
    if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && min > max)
      e('salary_max', 'Maximum must be greater than the minimum.');
  }

  if (!String(values.city || values.location || '').trim()) e('city', 'Location is required.');

  const openings = Number(values.openings || 1);
  if (!Number.isInteger(openings) || openings < 1 || openings > 999) e('openings', 'Between 1 and 999.');

  return { ok: Object.keys(errors).length === 0, errors };
}
