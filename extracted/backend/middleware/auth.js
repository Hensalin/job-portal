import { getUserFromToken } from '../services/authService.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in to continue.' });

  try {
    req.user = await getUserFromToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Log in again.' });
  }
}

export const requireRole = (role) => (req, res, next) => {
  if (req.user?.role !== role) {
    return res.status(403).json({ error: `Only ${role}s can do this.` });
  }
  next();
};
