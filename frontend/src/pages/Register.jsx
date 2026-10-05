import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Field, { TextInput, Select } from '../components/Field.jsx';
import {
  validateEmail, validatePassword, validateFullName, validatePhone, passwordStrength,
} from '../services/validation.js';

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'seeker',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const change = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  /**
   * Validate everything BEFORE calling the server.
   * This is for speed and a good message. The server validates again because
   * anyone can call the API without ever loading this page.
   */
  /**
   * Pulls the message out of a validator result, or '' when it passed.
   *
   * The validators return an OBJECT - { ok: true, value } or
   * { ok: false, error } - which is always truthy. This used to be written as
   * `if (validateEmail(x)) errors.email = validateEmail(x)`, so a perfectly
   * valid address assigned the whole object as the field's error. Field then
   * tried to render that object as a React child, React threw "Objects are not
   * valid as a React child", and the whole page went white on submit.
   *
   * Always read `.ok` and take `.error`.
   */
  const msg = (result) => (result?.ok ? '' : result?.error || '');

  const validate = () => {
    const e = {};
    e.fullName = msg(validateFullName(form.fullName));
    e.email = msg(validateEmail(form.email));
    // Phone is optional, so only check it when something was typed.
    if (form.phone) e.phone = msg(validatePhone(form.phone));
    e.password = msg(validatePassword(form.password));
    if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match.';

    // Drop the empty entries so we only report what is actually wrong.
    return Object.fromEntries(Object.entries(e).filter(([, v]) => v));
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setError('');

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setError('Please fix the highlighted fields.');
      return;
    }

    setLoading(true);
    try {
      const data = await register({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        // Sent so the server can catch a typo. It is optional there, but a
        // client that omits it gets no second chance to notice a bad password.
        confirmPassword: form.confirmPassword,
        role: form.role,
      });
      toast.success('Account created. Please log in.');
      navigate('/login', { state: { email: data.user?.email || form.email } });
    } catch (err) {
      setError(err.message);
      if (err.details) setErrors(err.details);
    } finally {
      setLoading(false);
    }
  };

  const strength = passwordStrength(form.password);

  return (
    <div className="auth-wrap">
      <form className="card form narrow" onSubmit={submit} noValidate>
        <h1>Create your account</h1>
        <p className="muted">Free. Takes about a minute.</p>

        {error && <p className="alert" role="alert">{error}</p>}

        <Field label="Full name" required error={errors.fullName} htmlFor="fullName">
          <TextInput
            name="fullName" value={form.fullName} onChange={change}
            error={errors.fullName} autoComplete="name" placeholder="Neha Sharma"
          />
        </Field>

        <Field label="Email" required error={errors.email} htmlFor="email">
          <TextInput
            name="email" type="email" value={form.email} onChange={change}
            error={errors.email} autoComplete="email" placeholder="you@example.com"
          />
        </Field>

        <Field label="Phone" error={errors.phone} hint="Optional. Employers use this only for shortlisted candidates." htmlFor="phone">
          <TextInput
            name="phone" type="tel" value={form.phone} onChange={change}
            error={errors.phone} autoComplete="tel" placeholder="+91 98765 43210"
          />
        </Field>

        <Field
          label="Password" required error={errors.password}
          hint={form.password ? `Strength: ${strength.label}` : 'At least 8 characters, with an uppercase letter and a number.'}
          htmlFor="password"
        >
          <TextInput
            name="password" type="password" value={form.password} onChange={change}
            error={errors.password} autoComplete="new-password"
          />
          {form.password && <div className={`meter meter-${strength.key}`}><i style={{ width: `${strength.pct}%` }} /></div>}
        </Field>

        <Field label="Confirm password" required error={errors.confirmPassword} htmlFor="confirmPassword">
          <TextInput
            name="confirmPassword" type="password" value={form.confirmPassword} onChange={change}
            error={errors.confirmPassword} autoComplete="new-password"
          />
        </Field>

        <Field label="I am looking for" htmlFor="role">
          <Select
            name="role" value={form.role} onChange={change}
            options={[
              { value: 'seeker', label: 'A job (I am a job seeker)' },
              { value: 'employer', label: 'Candidates (I am hiring)' },
            ]}
          />
        </Field>

        <button className="btn btn-block" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <p className="muted center">Have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}