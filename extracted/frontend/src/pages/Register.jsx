import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function Register() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'seeker' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.register(form);
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card form narrow" onSubmit={submit}>
      <h1>Create account</h1>
      {error && <p className="error">{error}</p>}
      <label>Full name
        <input name="fullName" value={form.fullName} onChange={change} required />
      </label>
      <label>Email
        <input name="email" type="email" value={form.email} onChange={change} required />
      </label>
      <label>Password (6+ characters)
        <input name="password" type="password" minLength={6} value={form.password} onChange={change} required />
      </label>
      <label>I am a
        <select name="role" value={form.role} onChange={change}>
          <option value="seeker">Job seeker</option>
          <option value="employer">Employer</option>
        </select>
      </label>
      <button className="btn" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
      <p className="muted">Have an account? <Link to="/login">Log in</Link></p>
    </form>
  );
}
