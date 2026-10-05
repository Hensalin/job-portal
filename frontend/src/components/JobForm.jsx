import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Field, { TextInput, TextArea, Select, TagsInput, Checkbox } from './Field.jsx';
import { ErrorState, Skeleton } from './Skeleton.jsx';

/**
 * Shared by PostJob and EditJob.
 *
 * WHY ONE COMPONENT FOR BOTH: the two screens have identical fields. Two
 * copies means a new field gets added to one page and forgotten on the other,
 * which is exactly how "I filled it in and it saved as blank" bugs happen.
 *
 * The ONE difference between posting and editing is the initial data, so that
 * is the only prop that differs between the two pages.
 *
 * FIELD NAMES ARE SNAKE_CASE (`salary_min`, `work_mode`, `required_skills`).
 * That is what `validateJobPayload` reads. See the note in Profile.jsx - this
 * asymmetry is deliberate on the server side, so it is explicit here.
 */

const JOB_TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract', 'Freelance', 'Temporary', 'Remote'];
const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];
const EXPERIENCE_LEVELS = ['Fresher', '0-1 years', '1-3 years', '3-5 years', '5-10 years', '10+ years'];
const SALARY_PERIODS = ['Per year', 'Per month', 'Per hour'];
const REMOTE_SCOPES = ['Remote', 'Remote within country', 'Worldwide remote'];

const blank = () => ({
  title: '', company: '', department: '', type: 'Full-time', work_mode: '',
  experience_level: '', openings: 1,
  country: 'India', state: '', city: '', location: '', office_address: '',
  remote_scope: '',
  salary_min: '', salary_max: '', currency: 'INR', salary_period: 'Per year', hide_salary: false,
  description: '', overview: '', responsibilities: '', required_skills: [], preferred_skills: [],
  qualifications: '', experience_required: '', education_req: '', benefits: '', perks: '',
  work_environment: '', about_company: '', status: 'active',
});

/** Read shape -> form shape. Written out so a mismatch is visible in review. */
export function jobToForm(job) {
  if (!job) return blank();
  return {
    ...blank(),
    ...job,
    // A stored array becomes a comma string the TagsInput can show.
    required_skills: (job.requiredSkills || []).join(', '),
    preferred_skills: (job.preferredSkills || []).join(', '),
    salary_min: job.salaryMin ?? '',
    salary_max: job.salaryMax ?? '',
  };
}

/** Form shape -> body shape. Empty strings become null so the server skips them. */
function formToBody(form) {
  const clean = (v) => (v === '' || v === undefined ? null : v);
  return {
    title: form.title.trim(),
    company: form.company.trim(),
    department: clean(form.department),
    type: form.type,
    work_mode: clean(form.work_mode),
    experience_level: clean(form.experience_level),
    openings: Number(form.openings) || 1,
    country: clean(form.country) || 'India',
    state: clean(form.state),
    city: clean(form.city),
    location: clean(form.location),
    office_address: clean(form.office_address),
    remote_scope: clean(form.remote_scope),
    salary_min: form.salary_min === '' ? null : Number(form.salary_min),
    salary_max: form.salary_max === '' ? null : Number(form.salary_max),
    currency: form.currency || 'INR',
    salary_period: clean(form.salary_period),
    hide_salary: !!form.hide_salary,
    description: form.description.trim(),
    overview: clean(form.overview?.trim()),
    responsibilities: clean(form.responsibilities?.trim()),
    required_skills: form.required_skills,
    preferred_skills: form.preferred_skills,
    qualifications: clean(form.qualifications?.trim()),
    experience_required: clean(form.experience_required?.trim()),
    education_req: clean(form.education_req?.trim()),
    benefits: clean(form.benefits?.trim()),
    perks: clean(form.perks?.trim()),
    work_environment: clean(form.work_environment?.trim()),
    about_company: clean(form.about_company?.trim()),
    status: form.status,
  };
}

export default function JobForm({ mode }) {
  const editing = mode === 'edit';
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  // Load the job we are editing. Only this screen fetches on mount.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoading(true);
    api.getJob(id)
      .then((d) => { if (!cancelled) setForm(jobToForm(d.job)); })
      .catch((e) => { if (!cancelled) setLoadError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editing, id]);

  const change = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!String(form.title).trim()) e.title = 'Job title is required.';
    else if (String(form.title).trim().length < 3) e.title = 'That title is too short.';

    if (!String(form.company).trim()) e.company = 'Company is required.';
    if (!form.city?.trim() && !form.location?.trim() && !form.country?.trim()) {
      e.city = 'Give at least a city, a full location, or a country.';
    }
    if (!String(form.description).trim()) e.description = 'A description is required.';
    else if (String(form.description).trim().length < 40) {
      e.description = 'Write at least 40 characters so candidates know what the job is.';
    }

    const lo = form.salary_min === '' ? null : Number(form.salary_min);
    const hi = form.salary_max === '' ? null : Number(form.salary_max);
    if (lo !== null && (!Number.isFinite(lo) || lo < 0)) e.salary_min = 'Enter a number, or leave it empty.';
    if (hi !== null && (!Number.isFinite(hi) || hi < 0)) e.salary_max = 'Enter a number, or leave it empty.';
    // The classic mistake: max below min.
    if (lo !== null && hi !== null && hi < lo) e.salary_max = 'Maximum cannot be lower than the minimum.';
    if (form.openings !== '' && Number(form.openings) < 1) e.openings = 'At least one opening.';

    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const body = formToBody(form);
      const result = editing ? await api.updateJob(id, body) : await api.createJob(body);
      const jobId = result.job?.id || result.id;
      toast.success(editing ? 'Job updated.' : 'Job published.');
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      if (err.details) setErrors(err.details);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton lines={5} />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => window.location.reload()} />;

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>Basics</h2>

      <div className="grid">
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Job title" required error={errors.title} htmlFor="title">
            <TextInput id="title" name="title" value={form.title} onChange={change} error={errors.title}
              placeholder="Senior React Developer" />
          </Field>
        </div>

        <Field label="Company" required error={errors.company}
          hint="Leave blank to reuse your company profile." htmlFor="company">
          <TextInput id="company" name="company" value={form.company} onChange={change} error={errors.company} />
        </Field>

        <Field label="Department" error={errors.department} htmlFor="department">
          <TextInput id="department" name="department" value={form.department} onChange={change}
            placeholder="Engineering" />
        </Field>

        <Field label="Job type" required error={errors.type} htmlFor="type">
          <Select id="type" name="type" value={form.type} onChange={change} error={errors.type} options={JOB_TYPES} />
        </Field>

        <Field label="Work mode" error={errors.work_mode} htmlFor="work_mode">
          <Select id="work_mode" name="work_mode" value={form.work_mode} onChange={change}
            placeholder="Any" options={WORK_MODES} />
        </Field>

        <Field label="Experience level" error={errors.experience_level} htmlFor="experience_level">
          <Select id="experience_level" name="experience_level" value={form.experience_level}
            onChange={change} placeholder="Any" options={EXPERIENCE_LEVELS} />
        </Field>

        <Field label="Number of openings" error={errors.openings} htmlFor="openings">
          <TextInput id="openings" name="openings" type="number" min="1" value={form.openings}
            onChange={change} error={errors.openings} />
        </Field>

        <Field label="Status" hint="Draft keeps it hidden from candidates." htmlFor="status">
          <Select id="status" name="status" value={form.status} onChange={change}
            options={[
              { value: 'active', label: 'Live' },
              { value: 'draft', label: 'Draft (hidden)' },
              { value: 'paused', label: 'Paused' },
              { value: 'closed', label: 'Closed' },
            ]} />
        </Field>
      </div>

      <h2>Location</h2>
      <div className="grid">
        <Field label="City" error={errors.city} htmlFor="city">
          <TextInput id="city" name="city" value={form.city} onChange={change} error={errors.city} placeholder="Bengaluru" />
        </Field>
        <Field label="State" error={errors.state} htmlFor="state">
          <TextInput id="state" name="state" value={form.state} onChange={change} error={errors.state} placeholder="Karnataka" />
        </Field>
        <Field label="Country" htmlFor="country">
          <TextInput id="country" name="country" value={form.country} onChange={change} />
        </Field>
        <Field label="Remote scope" error={errors.remote_scope} htmlFor="remote_scope">
          <Select id="remote_scope" name="remote_scope" value={form.remote_scope} onChange={change}
            placeholder="Not applicable" options={REMOTE_SCOPES} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Office address" hint="Optional. Shown only after you shortlist someone." htmlFor="office_address">
            <TextInput id="office_address" name="office_address" value={form.office_address} onChange={change} />
          </Field>
        </div>
      </div>

      <h2>Salary</h2>
      <div className="grid">
        <Field label="Minimum" error={errors.salary_min} htmlFor="salary_min">
          <TextInput id="salary_min" name="salary_min" type="number" min="0" value={form.salary_min}
            onChange={change} error={errors.salary_min} placeholder="800000" />
        </Field>
        <Field label="Maximum" error={errors.salary_max} htmlFor="salary_max">
          <TextInput id="salary_max" name="salary_max" type="number" min="0" value={form.salary_max}
            onChange={change} error={errors.salary_max} placeholder="1400000" />
        </Field>
        <Field label="Per" htmlFor="salary_period">
          <Select id="salary_period" name="salary_period" value={form.salary_period} onChange={change}
            options={SALARY_PERIODS} />
        </Field>
      </div>
      <Checkbox name="hide_salary" checked={form.hide_salary} onChange={change}
        label="Hide the salary range from candidates" />

      <h2>Description</h2>
      <Field label="Short summary" required error={errors.description}
        hint="The first thing candidates read. At least 40 characters." htmlFor="description">
        <TextArea id="description" name="description" value={form.description} onChange={change}
          error={errors.description} rows={4}
          placeholder="We are hiring a React developer to build our customer-facing dashboard." />
      </Field>

      <div style={{ marginTop: '1rem' }}>
        <Field label="Full description" hint="Optional, longer detail." htmlFor="overview">
          <TextArea id="overview" name="overview" value={form.overview} onChange={change} rows={6} />
        </Field>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <Field label="Responsibilities" hint="One per line." htmlFor="responsibilities">
          <TextArea id="responsibilities" name="responsibilities" value={form.responsibilities}
            onChange={change} rows={5}
            placeholder={'Build reusable UI components\nWrite tests for new features\nReview pull requests'} />
        </Field>
      </div>

      <h2>Skills and requirements</h2>
      <div className="grid">
        <Field label="Required skills" hint="Comma separated." htmlFor="required_skills">
          <TagsInput id="required_skills" name="required_skills" value={form.required_skills} onChange={change} />
        </Field>
        <Field label="Nice to have" hint="Comma separated." htmlFor="preferred_skills">
          <TagsInput id="preferred_skills" name="preferred_skills" value={form.preferred_skills} onChange={change} />
        </Field>
        <Field label="Qualifications" htmlFor="qualifications">
          <TextArea id="qualifications" name="qualifications" value={form.qualifications} onChange={change} rows={3} />
        </Field>
        <Field label="Experience needed" htmlFor="experience_required">
          <TextInput id="experience_required" name="experience_required" value={form.experience_required} onChange={change} />
        </Field>
        <Field label="Education needed" htmlFor="education_req">
          <TextInput id="education_req" name="education_req" value={form.education_req} onChange={change}
            placeholder="B.Tech or equivalent" />
        </Field>
      </div>

      <h2>Perks</h2>
      <div className="grid">
        <Field label="Benefits" htmlFor="benefits">
          <TextArea id="benefits" name="benefits" value={form.benefits} onChange={change} rows={3}
            placeholder={'Health insurance\nPaid leave'} />
        </Field>
        <Field label="Perks" htmlFor="perks">
          <TextArea id="perks" name="perks" value={form.perks} onChange={change} rows={3}
            placeholder={'Remote budget\nLearning stipend'} />
        </Field>
        <Field label="Work environment" htmlFor="work_environment">
          <TextInput id="work_environment" name="work_environment" value={form.work_environment} onChange={change} />
        </Field>
        <Field label="About the company" hint="Leave blank to reuse your company profile." htmlFor="about_company">
          <TextArea id="about_company" name="about_company" value={form.about_company} onChange={change} rows={3} />
        </Field>
      </div>

      <div className="row">
        <button className="btn btn-big" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Publish job'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => navigate(-1)}>Cancel</button>
      </div>
    </form>
  );
}