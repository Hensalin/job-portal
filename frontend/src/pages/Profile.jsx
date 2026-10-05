import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Field, { TextInput, TextArea, TagsInput, Select, Checkbox } from '../components/Field.jsx';
import SectionEditor from '../components/SectionEditor.jsx';
import ResumeManager from '../components/ResumeManager.jsx';
import { Skeleton, ErrorState } from '../components/Skeleton.jsx';
import { validateUrl } from '../services/validation.js';

/**
 * The profile form sends SNAKE_CASE, not camelCase.
 *
 * WHY: `profileService.updateProfile` reads `body.full_name`,
 * `body.current_title`, `body.years_experience`. The server contract is the
 * database's own naming. Sending camelCase would silently save nothing - no
 * error, just an empty form that appears to lose your data.
 *
 * While reading, the response IS camelCase (`profile.fullName`). That
 * asymmetry is real, so the mapping is written out explicitly rather than
 * converted by a loop, where a typo would be invisible.
 */
const FIELDS = [
  { db: 'full_name',        label: 'Full name',       required: true },
  { db: 'phone',            label: 'Phone',           type: 'tel' },
  { db: 'headline',         label: 'Headline',        hint: 'One line an employer reads first.' },
  { db: 'location',         label: 'Location',        hint: 'City, for example Bengaluru.' },
  { db: 'current_title',    label: 'Current job title' },
  { db: 'years_experience', label: 'Years of experience', type: 'number', min: 0, max: 60 },
  { db: 'expected_salary',  label: 'Expected salary', hint: 'Optional, e.g. 12 LPA.' },
  { db: 'notice_period',    label: 'Notice period',   hint: 'Optional, e.g. 30 days.' },
  { db: 'linkedin',         label: 'LinkedIn URL' },
  { db: 'github',           label: 'GitHub URL' },
  { db: 'portfolio',        label: 'Portfolio URL' },
  { db: 'website',          label: 'Website' },
];

const emptyForm = {
  full_name: '', phone: '', headline: '', about: '', location: '', current_title: '',
  years_experience: '', skills: [], languages: [], portfolio: '', linkedin: '', github: '',
  website: '', expected_salary: '', preferred_job_type: '', preferred_location: '',
  remote_preference: false, notice_period: '', avatar_url: '',
};

export default function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(emptyForm);
  const [profile, setProfile] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await api.getProfile();
      setProfile(data);
      setResumes(data.resumes || []);
      setForm({
        full_name: data.fullName || '',
        phone: data.phone || '',
        headline: data.headline || '',
        about: data.about || '',
        location: data.location || '',
        current_title: data.currentRole || '',
        years_experience: data.yearsExperience ?? '',
        skills: data.skills || [],
        languages: data.languages || [],
        portfolio: data.portfolio || '',
        linkedin: data.linkedin || '',
        github: data.github || '',
        website: data.website || '',
        expected_salary: data.expectedSalary || '',
        preferred_job_type: data.preferredJobType || '',
        preferred_location: data.preferredLocation || '',
        remote_preference: !!data.remotePreference,
        notice_period: data.noticePeriod || '',
        avatar_url: data.avatarUrl || '',
      });
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const change = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!String(form.full_name).trim()) e.full_name = 'Full name is required.';
    else if (String(form.full_name).trim().length < 2) e.full_name = 'That name is too short.';
    if (String(form.years_experience).trim()) {
      const n = Number(form.years_experience);
      if (!Number.isFinite(n) || n < 0 || n > 60) e.years_experience = 'Enter a number between 0 and 60.';
    }
    // validateUrl returns { ok, value } / { ok, error } - an object that is
    // always truthy, so the old check flagged every filled-in URL as an error
    // and stored the object itself as the message. Read .ok, take .error.
    for (const key of ['linkedin', 'github', 'portfolio', 'website', 'avatar_url']) {
      if (!form[key]) continue;
      const r = validateUrl(form[key]);
      if (!r.ok) e[key] = r.error;
    }
    return e;
  };

  const save = async (e) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        years_experience: form.years_experience === '' ? 0 : Number(form.years_experience),
      };
      const updated = await api.updateProfile(payload);
      setProfile(updated);
      // The navbar shows the name, so keep it in step.
      refresh().catch(() => {});
      toast.success('Profile saved.');
    } catch (err) {
      if (err.details) setErrors(err.details);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton lines={6} />;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  const completeness = profile?.completeness || [];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>My profile</h1>
          <p className="muted">This is what employers see when they open your application.</p>
        </div>
      </header>

      {completeness.length > 0 && (
        <div className="card">
          <h2>Profile strength</h2>
          <p className="muted small">Complete profiles get noticeably more replies.</p>
          <ul className="check-list">
            {completeness.map((c) => (
              <li key={c.key} className={c.done ? 'done' : ''}>
                <span aria-hidden="true">{c.done ? '✅' : '⬜'}</span>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="card form" onSubmit={save} noValidate>
        <h2>Basic details</h2>

        <div className="grid">
          {FIELDS.map((f) => (
            <div key={f.db} style={['headline', 'expected_salary'].includes(f.db) ? { gridColumn: '1 / -1' } : undefined}>
              <Field label={f.label} required={f.required} error={errors[f.db]} hint={f.hint} htmlFor={f.db}>
                <TextInput
                  id={f.db} name={f.db} type={f.type || 'text'} min={f.min} max={f.max}
                  value={form[f.db]} onChange={change} error={errors[f.db]}
                />
              </Field>
            </div>
          ))}

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="About" hint="A short summary. Plain text, up to 3000 characters." htmlFor="about">
              <TextArea id="about" name="about" value={form.about} onChange={change} rows={5} />
            </Field>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Skills" hint="Comma separated. These are what the job matcher compares." htmlFor="skills">
              <TagsInput id="skills" name="skills" value={form.skills} onChange={change}
                placeholder="React, CSS, Node.js" />
            </Field>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Languages" hint="Comma separated." htmlFor="languages">
              <TagsInput id="languages" name="languages" value={form.languages} onChange={change}
                placeholder="English, Hindi" />
            </Field>
          </div>

          <Field label="Preferred job type" htmlFor="preferred_job_type">
            <Select id="preferred_job_type" name="preferred_job_type" value={form.preferred_job_type}
              onChange={change} placeholder="No preference"
              options={['Full-time', 'Part-time', 'Internship', 'Contract', 'Freelance', 'Remote']} />
          </Field>

          <Field label="Preferred location" htmlFor="preferred_location">
            <TextInput id="preferred_location" name="preferred_location" value={form.preferred_location} onChange={change} />
          </Field>
        </div>

        <Checkbox name="remote_preference" checked={form.remote_preference}
          onChange={(_, v) => change('remote_preference', v)} label="I am open to remote work" />

        <div className="row">
          <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
          <span className="muted small">Signed in as {user?.email}</span>
        </div>
      </form>

      {/* ResumeManager always hands back the new array, so this only ever
          touches the resume list. The old fallback - load() when no array was
          passed - set loading=true, which unmounted this whole form and then
          refilled it from the server, discarding every unsaved field. */}
      <ResumeManager resumes={resumes} onChange={setResumes} />

      {/* Both editors hand back their own updated rows. We merge them into
          `profile` only - never into `form` - so saving a resume or a work
          entry leaves every unsaved field in the basic-details form exactly
          as the user typed it. */}
      <SectionEditor
        kind="experience"
        rows={profile?.experience || []}
        onChange={(rows) => setProfile((p) => ({ ...p, experience: rows }))}
      />
      <SectionEditor
        kind="education"
        rows={profile?.education || []}
        onChange={(rows) => setProfile((p) => ({ ...p, education: rows }))}
      />
      <SectionEditor
        kind="certifications"
        rows={profile?.certifications || []}
        onChange={(rows) => setProfile((p) => ({ ...p, certifications: rows }))}
      />
    </>
  );
}