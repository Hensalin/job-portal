/**
 * Unit tests for the PURE logic in the backend - no database, no network.
 * These prove validation, match scoring and search sanitising are correct
 * before you ever apply the migration.
 *
 *   cd backend && node practice/unit-tests.mjs
 */
import {
  validateEmail, validatePassword, validateFullName, validatePhone,
  validateUrl, validateText, validateYear, validateFields, assertFields,
} from '../utils/validators.js';
import { scoreJob, recommendJobs } from '../utils/match.js';
import { sanitizeSearch } from '../services/jobService.js';
import { ApiError } from '../utils/ApiError.js';

let pass = 0, fail = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; failures.push(`${name}\n     expected: ${e}\n     actual:   ${a}`); }
}
function ok(name, value) { check(name, !!value, true); }

// ============================================================ EMAIL
ok('accepts normal email', validateEmail('Neha@Example.IO').value === 'neha@example.io');
ok('lowercases + trims', validateEmail('  A.B+tag@x.co  ').value === 'a.b+tag@x.co');
ok('accepts real disposable provider', validateEmail('neha@mail.com').ok);
ok('accepts short local part (hr@)', validateEmail('hr@acmetech.com').ok);
ok('accepts 1-char local part', validateEmail('j@x.com').ok);
for (const bad of ['', 'abc', 'a@b', 'a@bcom', '@x.com', 'a@.com', 'a@x..com',
  '.a@x.com', 'a.@x.com', 'a..b@x.com', 'a b@x.com',
  'user@hello.com', 'user@gmail.con', 'user@asdf.com']) {
  ok(`rejects email "${bad}"`, validateEmail(bad).ok === false);
}

// ============================================================ PASSWORD
ok('accepts strong pw', validatePassword('GoodPass123').ok);
for (const [pw, why] of [['Ab1', 'too short'], ['alllower123', 'no upper'],
  ['ALLUPPER123', 'no lower'], ['NoDigitsHere', 'no digit'], ['aaaaaaaaaaaa', 'repeated'],
  ['password123', 'common'], ['12345678', 'sequence']]) {
  ok(`rejects password (${why})`, validatePassword(pw).ok === false);
}

// ============================================================ NAME
ok('accepts real name', validateFullName('  Neha   Sharma ').value === 'Neha Sharma');
ok('accepts hyphen+apostrophe', validateFullName("O'Brien-Smith").ok);
for (const bad of ['', 'a', '123', 'asdf', 'qwerty', 'john doe', 'test test']) {
  ok(`rejects name "${bad}"`, validateFullName(bad).ok === false);
}

// ============================================================ PHONE
ok('accepts 10-digit mobile', validatePhone('9876543210').ok);
ok('accepts +91 format', validatePhone('+91 98765 43210').ok);

// A blank phone is ALLOWED - the sign-up form marks the field optional and the
// API used to reject exactly what the form invited you to leave empty.
ok('accepts blank phone (field is optional)', validatePhone('').ok === true);
ok('accepts undefined phone', validatePhone(undefined).ok === true);
ok('blank phone yields null, not undefined', validatePhone('  ').value === null);
ok('rejects blank phone when required', validatePhone('', { required: true }).ok === false);

for (const bad of ['12345', 'abc', '+9198765432109999']) {
  ok(`rejects phone "${bad}"`, validatePhone(bad).ok === false);
}

// ============================================================ URL / TEXT / YEAR
ok('allows empty url', validateUrl('').value === null);
ok('rejects javascript: url', validateUrl('javascript:alert(1)').ok === false);
ok('rejects ftp url', validateUrl('ftp://x.com').ok === false);
ok('normalises url', validateUrl('https://x.com/a').value === 'https://x.com/a');
ok('optional text accepts empty', validateText('', { required: false }).value === null);
ok('required text rejects empty', validateText('', { required: true }).ok === false);
ok('year range', validateYear('3000').ok === false && validateYear('2020').ok === true);

// ============================================================ validateFields
const r1 = validateFields({ name: 'A', email: 'bad' }, {
  name: ['Name', validateFullName],
  email: ['Email', validateEmail],
});
ok('validateFields reports ok=false', r1.ok === false);
ok('validateFields keys errors by field', !!r1.errors.email && !!r1.errors.name);
try { assertFields(r1); ok('assertFields throws', false); }
catch (e) { ok('assertFields throws ApiError 400', e instanceof ApiError && e.status === 400); }

// ============================================================ sanitizeSearch
check('strips comma', sanitizeSearch('a,b'), 'a b');
check('strips parens', sanitizeSearch('a(b)c'), 'a b c');
check('strips % wildcard', sanitizeSearch('100%'), '100');
check('strips _ wildcard', sanitizeSearch('a_b'), 'a b');
check('truncates', sanitizeSearch('x'.repeat(200)).length, 80);
check('keeps normal text', sanitizeSearch('react developer'), 'react developer');

// ============================================================ match scoring
const job = {
  title: 'React Developer', type: 'Full-time', work_mode: 'Remote',
  experience_level: '1-3 years', city: 'Pune', state: 'Maharashtra',
  required_skills: ['React', 'JavaScript', 'CSS'],
  preferred_skills: ['TypeScript'],
};
const strong = { skills: ['react', 'javascript', 'css', 'typescript'], currentRole: 'React Developer',
  years_experience: 3, preferred_location: 'Pune', preferred_job_type: 'Full-time', remote_preference: true };
const weak = { skills: ['Excel'], currentRole: 'Accountant', years_experience: 0,
  preferred_location: 'Delhi', preferred_job_type: 'Part-time', remote_preference: false };

const s1 = scoreJob(job, strong);
const s2 = scoreJob(job, weak);
ok('strong profile scores higher', s1.score > s2.score);
ok('strong profile scores high (>80)', s1.score > 80);
ok('score is 0-100', s1.score <= 100 && s1.score >= 0);
ok('matches required skills', s1.matchedSkills.length === 3);
ok('lists missing skills', Array.isArray(s1.missingSkills));
ok('gives reasons', s1.reasons.length > 0);
ok('case-insensitive skill match', s1.matchedSkills.includes('React'));
ok('weak profile scores low (<40)', s2.score < 40);

check('empty profile does not crash', typeof scoreJob(job, {}).score, 'number');
check('missing fields do not crash', typeof scoreJob({}, {}).score, 'number');

const ranked = recommendJobs([job, { title: 'Accountant', required_skills: ['Excel'] }], strong);
ok('recommendJobs sorts desc', ranked[0].match.score >= ranked[1].match.score);

// ============================================================ REPORT
console.log('\n================ UNIT TEST RESULTS ================');
console.log(`  passed: ${pass}`);
console.log(`  failed: ${fail}`);
if (failures.length) {
  console.log('\n  FAILURES:');
  failures.forEach((f) => console.log('   - ' + f));
}
console.log('==================================================\n');
process.exit(fail ? 1 : 0);
