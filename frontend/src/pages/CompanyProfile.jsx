import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Field, { TextInput, TextArea, Select, TagsInput } from '../components/Field.jsx';
import { Skeleton, ErrorState } from '../components/Skeleton.jsx';
import { validateUrl } from '../services/validation.js';

const SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
const SOCIALS = ['linkedin', 'twitter', 'github', 'instagram'];

const empty = {
  name: '', industry: '', size: '', founded_year: '', website: '', email: '', phone: '',
  location: '', about: '', culture: '', benefits: [], logo_url: '',
  social_links: { linkedin: '', twitter: '', github: '', instagram: '' },
};

/**
 * One company per employer account.
 *
 * `POST /api/companies/company` is an upsert: the backend looks up a company
 * owned by this user and inserts only if none exists. So there is no separate
 * "create" and "edit" - the same screen and the same button do both. That is
 * why the page always saves, never asks "are you creating or editing?".
 */
export default function CompanyProfile() {
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMyCompany();
      if (data.company) {
        setCompany(data.company);
        setForm({
          name: data.company.name || '',
          industry: data.company.industry || '',
          size: data.company.size || '',
          founded_year: data.company.foundedYear ?? '',
          website: data.company.website || '',
          email: data.company.email || '',
          phone: data.company.phone || '',
          location: data.company.location || '',
          about: data.company.about || '',
          culture: data.company.culture || '',
          benefits: data.company.benefits || [],
          logo_url: data.company.logoUrl || '',
          social_links: { ...empty.social_links, ...(data.company.socialLinks || {}) },
        });
      } else {
        // No company yet - a clean form, not an error.
        setCompany(null);
        setForm(empty);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const change = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  const changeSocial = (key, value) => {
    setForm((f) => ({ ...f, social_links: { ...f.social_links, [key]: value } }));
    setErrors((e) => ({ ...e, [`social_${key}`]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!String(form.name).trim()) e.name = 'Company name is required.';
    // validateUrl returns { ok, value } / { ok, error }. That object is always
    // truthy, so `if (validateUrl(x))` was true even for a valid URL and stored
    // the object as the error message. Read .ok and take .error.
    const urlMsg = (result) => (result?.ok ? '' : result?.error || '');
    for (const key of ['website', 'logo_url']) {
      if (form[key]) e[key] = urlMsg(validateUrl(form[key]));
    }
    for (const key of SOCIALS) {
      if (form.social_links[key]) e[`social_${key}`] = urlMsg(validateUrl(form.social_links[key], key));
    }
    if (form.founded_year !== '') {
      const y = Number(form.founded_year);
      if (!Number.isInteger(y) || y < 1800 || y > new Date().getFullYear()) {
        e.founded_year = 'Enter a real year.';
      }
    }
    return e;
  };

  const save = async (ev) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      // Empty social links are dropped so the server does not validate "" as a URL.
      const social = Object.fromEntries(
        Object.entries(form.social_links).filter(([, v]) => v && v.trim())
      );
      const data = await api.saveCompany({
        ...form,
        founded_year: form.founded_year === '' ? undefined : Number(form.founded_year),
        social_links: social,
      });
      setCompany(data.company);
      toast.success(company ? 'Company profile updated.' : 'Company profile created.');
      load();
    } catch (err) {
      if (err.details) setErrors(err.details);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton lines={5} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Company profile</h1>
          <p className="muted">
            {company
              ? 'This appears on every job you post.'
              : 'Create this once and it fills itself in on every job you post.'}
          </p>
        </div>
        {company && (
          <a className="btn btn-quiet" href={`/companies/${company.id}`}>View public page</a>
        )}
      </header>

      <form className="card form" onSubmit={save} noValidate>
        <h2>Basics</h2>
        <div className="grid">
          <Field label="Company name" required error={errors.name} htmlFor="name">
            <TextInput id="name" name="name" value={form.name} onChange={change} error={errors.name} />
          </Field>

          <Field label="Industry" error={errors.industry} htmlFor="industry">
            <TextInput id="industry" name="industry" value={form.industry} onChange={change}
              placeholder="Information Technology" />
          </Field>

          <Field label="Company size" error={errors.size} htmlFor="size">
            <Select id="size" name="size" value={form.size} onChange={change} placeholder="Select…" options={SIZES} />
          </Field>

          <Field label="Founded" error={errors.founded_year} htmlFor="founded_year">
            <TextInput id="founded_year" name="founded_year" type="number" min="1800" max="2100"
              value={form.founded_year} onChange={change} error={errors.founded_year} placeholder="2016" />
          </Field>

          <Field label="Headquarters" error={errors.location} htmlFor="location">
            <TextInput id="location" name="location" value={form.location} onChange={change}
              placeholder="Bengaluru, India" />
          </Field>

          <Field label="Website" error={errors.website} htmlFor="website">
            <TextInput id="website" name="website" value={form.website} onChange={change} error={errors.website}
              placeholder="https://yourcompany.com" />
          </Field>

          <Field label="Hiring email" error={errors.email} hint="Where candidates should send their resume." htmlFor="email">
            <TextInput id="email" name="email" type="email" value={form.email} onChange={change} error={errors.email} />
          </Field>

          <Field label="Phone" error={errors.phone} htmlFor="phone">
            <TextInput id="phone" name="phone" type="tel" value={form.phone} onChange={change} error={errors.phone} />
          </Field>

          <Field label="Logo URL" error={errors.logo_url} hint="Link to an image file." htmlFor="logo_url">
            <TextInput id="logo_url" name="logo_url" value={form.logo_url} onChange={change} error={errors.logo_url}
              placeholder="https://…/logo.png" />
          </Field>
        </div>

        <h2>About</h2>
        <Field label="About the company" htmlFor="about">
          <TextArea id="about" name="about" value={form.about} onChange={change} rows={5}
            placeholder="What the company does, who it serves, how big it is." />
        </Field>

        <div style={{ marginTop: '1rem' }}>
          <Field label="Culture" htmlFor="culture">
            <TextArea id="culture" name="culture" value={form.culture} onChange={change} rows={4}
              placeholder="How the team works, what the interview process is like." />
          </Field>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <Field label="Benefits" hint="Comma separated." htmlFor="benefits">
            <TagsInput id="benefits" name="benefits" value={form.benefits} onChange={change}
              placeholder="Health insurance, Paid leave, Remote budget" />
          </Field>
        </div>

        <h2>Social links</h2>
        <div className="grid">
          {SOCIALS.map((s) => (
            <Field key={s} label={s} error={errors[`social_${s}`]} htmlFor={`social_${s}`}>
              <TextInput id={`social_${s}`} name={`social_${s}`} value={form.social_links[s]}
                onChange={(_, v) => changeSocial(s, v)} error={errors[`social_${s}`]}
                placeholder={`https://${s}.com/yourcompany`} />
            </Field>
          ))}
        </div>

        <button className="btn btn-big" disabled={saving}>
          {saving ? 'Saving…' : company ? 'Save company profile' : 'Create company profile'}
        </button>
      </form>
    </>
  );
}