import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Field, { TextInput } from '../components/Field.jsx';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const change = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    // Clear the error as soon as the user starts fixing it.
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setErrors({});

    const next = {};
    if (!form.email.trim()) next.email = 'Enter your email.';
    if (!form.password) next.password = 'Enter your password.';
    if (Object.keys(next).length) return setErrors(next);

    setLoading(true);
    try {
      const user = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${user.fullName || user.email}.`);
      // Return to whatever page sent us here, otherwise the dashboard.
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      // The server tells us WHICH field is wrong - put it on the right input.
      if (err.details) setErrors(err.details);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card form narrow" onSubmit={submit} noValidate>
        <h1>Log in</h1>
        <p className="muted">Welcome back. Sign in to continue.</p>

        {error && <p className="alert" role="alert">{error}</p>}

        <Field label="Email" required error={errors.email} htmlFor="email">
          <TextInput
            name="email" type="email" value={form.email} onChange={change}
            error={errors.email} autoComplete="email" placeholder="you@example.com"
          />
        </Field>

        <Field label="Password" required error={errors.password} htmlFor="password">
          <TextInput
            name="password" type="password" value={form.password} onChange={change}
            error={errors.password} autoComplete="current-password"
          />
        </Field>

        <button className="btn btn-block" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>

        <p className="muted center">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}