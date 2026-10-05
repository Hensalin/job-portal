import * as auth from '../services/authService.js';
import { AUTO_CONFIRM_EMAIL } from '../services/authService.js';
import { validateFullName, validatePhone } from '../utils/validators.js';
import { ApiError } from '../utils/ApiError.js';

export async function register(req, res, next) {
  try {
    const { email, password, fullName, role, phone, confirmPassword } = req.body;

    // WHY THIS IS OPTIONAL: "confirm your password" is a UI affordance to catch
    // typos, not a security control - the server only ever receives one
    // password, so comparing it to a copy of itself proves nothing. Requiring
    // it unconditionally broke every client that does not send it, including
    // our own React form, so nobody could create an account at all.
    // Still checked when it IS sent, because a client that sends it and gets a
    // mismatch back has clearly made a typo.
    if (confirmPassword !== undefined && password !== confirmPassword)
      throw ApiError.badRequest('Passwords do not match.', { confirmPassword: 'Passwords do not match.' });

    const n = validateFullName(fullName);
    if (!n.ok) throw ApiError.badRequest(n.error, { fullName: n.error });

    const ph = validatePhone(phone);
    if (!ph.ok) throw ApiError.badRequest(ph.error, { phone: ph.error });

    if (!['seeker', 'employer'].includes(role))
      throw ApiError.badRequest('Choose job seeker or employer.', { role: 'Choose a valid role.' });

    const user = await auth.registerUser({ email, password, fullName: n.value, role, phone: ph.value });
    res.status(201).json({
      user,
      // Must describe what actually happened. Telling someone to check their
      // inbox when no email is ever sent makes a working signup look broken.
      message: AUTO_CONFIRM_EMAIL
        ? 'Account created. You can log in now.'
        : 'Account created. Check your inbox and click the verification link before logging in.',
    });
  } catch (e) { next(e); }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw ApiError.badRequest('Email and password are required.');
    res.json(await auth.loginUser({ email, password }));
  } catch (e) { next(e); }
}

export async function resendVerification(req, res, next) {
  try {
    res.json(await auth.resendVerification(req.body.email));
  } catch (e) { next(e); }
}

export function me(req, res) {
  res.json({ user: req.user });
}

export async function logout(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    res.json(await auth.logoutUser(token));
  } catch (e) { next(e); }
}