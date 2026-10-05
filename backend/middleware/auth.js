import { getUserFromToken } from '../services/authService.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * 1) AUTHENTICATION - is there a valid token?
 * Verifies the JWT with Supabase, then loads the profile so we know the role.
 */
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return next(ApiError.unauthorized('Log in to continue.'));

  try {
    req.user = await getUserFromToken(token);
    if (req.user.isActive === false) {
      return next(ApiError.forbidden('This account has been suspended.'));
    }
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : ApiError.unauthorized('Your session has expired. Log in again.'));
  }
}

/**
 * Optional auth for public routes that behave differently when logged in
 * (e.g. GET /api/jobs marks the jobs you have saved). Never rejects.
 */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return next();
  try {
    req.user = await getUserFromToken(token);
  } catch {
    // a bad token on a public route is simply ignored
  }
  next();
}

/**
 * 2) AUTHORISATION - is the role right?
 * admin is allowed through everything so Phase 19 is possible.
 */
export const requireRole = (role) => (req, _res, next) => {
  if (req.user?.role !== role && req.user?.role !== 'admin') {
    return next(ApiError.forbidden(`Only ${role}s can do this.`));
  }
  next();
};

export const requireAdmin = (_req, _res, next) => {
  if (_req.user?.role !== 'admin') return next(ApiError.forbidden('Admins only.'));
  next();
};

/** Accepts either 'seeker' or 'employer' so a shared route works for both. */
export const requireAnyRole = (...roles) => (req, _res, next) => {
  if (req.user?.role === 'admin' || roles.includes(req.user?.role)) return next();
  next(ApiError.forbidden(`Only ${roles.join(' or ')}s can do this.`));
};