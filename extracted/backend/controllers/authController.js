import { registerUser, loginUser } from '../services/authService.js';

export async function register(req, res) {
  const { email, password, fullName, role } = req.body;
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!['seeker', 'employer'].includes(role)) {
    return res.status(400).json({ error: 'Choose job seeker or employer.' });
  }
  try {
    const user = await registerUser({ email, password, fullName, role });
    res.status(201).json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  try {
    res.json(await loginUser({ email, password }));
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

export function me(req, res) {
  res.json({ user: req.user });
}
