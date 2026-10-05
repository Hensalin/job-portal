/**
 * Server-side validation. The frontend validates too, but the backend is the
 * only place validation actually counts - a client can always be bypassed.
 *
 * NOTE ON EMAILS: these rules validate FORMAT only. No regex can prove an inbox
 * exists. Real proof is the Supabase verification email (see authService).
 */
import { ApiError } from './ApiError.js';

// ---------------------------------------------------------------- email
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
// Domains that are always a typo rather than a real inbox.
// NOTE: only add domains that genuinely do not resolve. Do NOT add real
// providers (mail.com, email.com) - they are valid and users do use them.
const REJECT_DOMAINS = new Set([
  'gmail.con', 'gmail.co', 'yahoo.c', 'hotmail.co',
  'test.com', 'example.com', 'asdf.com', 'qwerty.com', 'hello.com',
]);

export function validateEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email is required.' };
  if (email.length > 254) return { ok: false, error: 'Email is too long.' };
  if (email.includes(' ')) return { ok: false, error: 'Please enter a valid email address.' };

  const at = email.indexOf('@');
  if (at < 0) return { ok: false, error: 'Please enter a valid email address.' };
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // Reject "abc@", "test@", "hello@hello" - domain must have a real TLD.
  if (!domain || !domain.includes('.')) return { ok: false, error: 'Please enter a valid email address.' };
  if (domain.startsWith('.') || domain.endsWith('..')) return { ok: false, error: 'Please enter a valid email address.' };
  if (REJECT_DOMAINS.has(domain)) return { ok: false, error: 'Please use a real email address.' };
  // RFC 5321 allows a 1-character local part. Real inboxes like "hr@" or "js@"
  // exist, so do NOT invent a minimum here - the verification email is what
  // actually proves the address works.
  if (!local || local.startsWith('.') || local.endsWith('.') || local.includes('..'))
    return { ok: false, error: 'Please enter a valid email address.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address.' };

  return { ok: true, value: email };
}

// ---------------------------------------------------------------- password
export function validatePassword(raw) {
  const pw = String(raw ?? '');
  if (!pw) return { ok: false, error: 'Password is required.' };
  if (pw.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  if (pw.length > 128) return { ok: false, error: 'Password is too long.' };
  if (!/[A-Z]/.test(pw)) return { ok: false, error: 'Password must contain an uppercase letter.' };
  if (!/[a-z]/.test(pw)) return { ok: false, error: 'Password must contain a lowercase letter.' };
  if (!/\d/.test(pw)) return { ok: false, error: 'Password must contain a number.' };
  if (/^(.)\1+$/.test(pw)) return { ok: false, error: 'Password is too simple.' };
  if (/^(12345678|password|qwertyui|letmein1)/i.test(pw))
    return { ok: false, error: 'That password is too common.' };
  return { ok: true, value: pw };
}

// ---------------------------------------------------------------- name
const MEANINGLESS_NAMES = new Set([
  'asdf', 'aaa', 'abc', 'test', 'testing', 'qwerty', 'xxx', 'zzz',
  'name', 'first last', 'john doe', 'test test',
]);

export function validateFullName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Full name is required.' };
  if (name.length < 2) return { ok: false, error: 'Full name must be at least 2 characters.' };
  if (name.length > 80) return { ok: false, error: 'Full name must be under 80 characters.' };
  if (!/[A-Za-z]/.test(name)) return { ok: false, error: 'Full name must contain letters.' };
  if (MEANINGLESS_NAMES.has(name.toLowerCase()))
    return { ok: false, error: 'Please enter your real name.' };
  if (!/^[\p{L}][\p{L}\p{M}\s'.-]*$/u.test(name))
    return { ok: false, error: 'Full name contains invalid characters.' };
  return { ok: true, value: name };
}

// ---------------------------------------------------------------- phone
/**
 * `required` defaults to FALSE on purpose.
 *
 * A phone number is optional in this product: the sign-up form says so, and
 * leaving it blank is a perfectly reasonable thing to do. This used to reject
 * a missing phone outright, so the form offered an optional field and the API
 * then demanded it - a user who followed the instructions exactly still got
 * "Phone number is required." Pass `{ required: true }` at a call site that
 * genuinely cannot work without one.
 */
export function validatePhone(raw, { required = false } = {}) {
  const phone = String(raw ?? '').trim();
  if (!phone) {
    return required
      ? { ok: false, error: 'Phone number is required.' }
      : { ok: true, value: null };
  }
  if (!/^\+?[\d\s()-]{7,20}$/.test(phone))
    return { ok: false, error: 'Enter a valid phone number.' };

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15)
    return { ok: false, error: 'Enter a valid phone number.' };

  // If it looks like an Indian number, validate the mobile prefix too.
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
    : digits.length === 10 ? digits
    : null;
  if (national && !/^[6-9]/.test(national))
    return { ok: false, error: 'Enter a valid mobile number (starts with 6-9).' };

  return { ok: true, value: phone };
}

// ---------------------------------------------------------------- url
export function validateUrl(raw, label = 'Link') {
  const v = String(raw ?? '').trim();
  if (!v) return { ok: true, value: null };
  try {
    const u = new URL(v);
    if (!['http:', 'https:'].includes(u.protocol))
      return { ok: false, error: `${label} must start with http:// or https://` };
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: `${label} must be a valid URL.` };
  }
}

// ---------------------------------------------------------------- text
export function validateText(raw, { label = 'This field', required = true, min = 2, max = 5000 } = {}) {
  const v = String(raw ?? '').trim();
  if (!v) return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null };
  if (v.length < min) return { ok: false, error: `${label} must be at least ${min} characters.` };
  if (v.length > max) return { ok: false, error: `${label} must be under ${max} characters.` };
  return { ok: true, value: v };
}

// ---------------------------------------------------------------- year
export function validateYear(raw, { label = 'Year', required = false } = {}) {
  const v = String(raw ?? '').trim();
  if (!v) return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null };
  const n = Number(v);
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(n) || n < 1950 || n > thisYear + 1)
    return { ok: false, error: `${label} looks invalid.` };
  return { ok: true, value: n };
}

// ---------------------------------------------------------------- helpers
/**
 * Runs a map of field -> [label, validatorFn, opts].
 * Returns { ok, value, errors } where errors is keyed by field name so the
 * frontend can highlight the exact input.
 */
export function validateFields(body, rules) {
  const errors = {};
  const value = {};
  for (const [field, [label, validator, opts = {}]] of Object.entries(rules)) {
    const raw = body?.[field];
    if (opts.optional && (raw === undefined || raw === null || raw === '')) {
      value[field] = null;
      continue;
    }
    const r = validator(raw);
    if (!r.ok) errors[field] = r.error;
    else value[field] = r.value;
  }
  return { ok: Object.keys(errors).length === 0, value, errors };
}

/** Throws a 400 with a per-field error map if anything failed. */
export function assertFields(result) {
  if (!result.ok) {
    const first = Object.values(result.errors)[0];
    throw ApiError.badRequest(first, result.errors);
  }
  return result.value;
}