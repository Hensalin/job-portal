import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { validateEmail, validatePassword } from '../utils/validators.js';

/**
 * Shapes a Supabase auth user + profile row into the object the API returns.
 * `emailConfirmed` comes from Supabase, `isActive` from our own column.
 */
function shape(user, profile) {
  return {
    id: user.id,
    email: user.email,
    fullName: profile.full_name,
    phone: profile.phone ?? null,
    role: profile.role,
    emailVerified: !!user.email_confirmed_at || profile.email_verified === true,
    isActive: profile.is_active !== false,
    createdAt: profile.created_at,
  };
}

/**
 * AUTO_CONFIRM_EMAIL decides whether a new account must click a verification
 * link before it can log in.
 *
 * WHY THIS EXISTS: with `email_confirm:false` Supabase sends a real email, but
 * a fresh Supabase project only allows a handful of test emails per day and
 * the built-in SMTP will not deliver to a real inbox. The result is an app
 * where nobody - not the owner, not a user - can ever finish signing up, and
 * the failure looks like a backend bug rather than a missing mail server.
 *
 * AUTO_CONFIRM_EMAIL=true  -> sign up and log straight in. Right for local
 *                             development, which is what .env ships with.
 * AUTO_CONFIRM_EMAIL=false -> require the email link. Turn this on (and add a
 *                             real SMTP provider in the Supabase dashboard)
 *                             before putting this in front of actual users.
 */
const AUTO_CONFIRM_EMAIL = String(process.env.AUTO_CONFIRM_EMAIL ?? 'true') === 'true';

export { AUTO_CONFIRM_EMAIL };

export async function registerUser({ email, password, fullName, role, phone }) {
  const e = validateEmail(email);
  if (!e.ok) throw ApiError.badRequest(e.error, { email: e.error });
  const p = validatePassword(password);
  if (!p.ok) throw ApiError.badRequest(p.error, { password: p.error });

  // email_confirm:true skips the verification email entirely (see above).
  const { data, error } = await supabase.auth.admin.createUser({
    email: e.value,
    password: p.value,
    email_confirm: AUTO_CONFIRM_EMAIL,
    user_metadata: { full_name: fullName, role },
  });

  if (error) {
    if (/already|registered|exists/i.test(error.message))
      throw ApiError.conflict('That email is already registered. Try logging in.');
    if (/password/i.test(error.message)) throw ApiError.badRequest(error.message);
    throw ApiError.badRequest(error.message);
  }
  if (!data?.user) throw ApiError.internal('Could not create your account.');

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: data.user.id,
      full_name: fullName,
      role,
      phone: phone ?? null,
      // Keep our own column in step with the auth user, otherwise the UI would
      // show an unverified badge next to an account that is already verified.
      email_verified: AUTO_CONFIRM_EMAIL,
      is_active: true,
    });

  if (profileError) {
    // Roll back so we never leave an auth user without a profile.
    await supabase.auth.admin.deleteUser(data.user.id);
    if (profileError.code === '23505') throw ApiError.conflict('That email is already registered.');
    throw ApiError.internal('Could not create your profile. Please try again.');
  }

  return shape(data.user, {
    full_name: fullName, role, phone, email_verified: AUTO_CONFIRM_EMAIL, is_active: true,
  });
}

export async function loginUser({ email, password }) {
  const e = validateEmail(email);
  if (!e.ok) throw ApiError.unauthorized('Wrong email or password.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: e.value,
    password,
  });

  if (error || !data?.session) {
    if (/not confirmed|verify/i.test(error?.message || ''))
      throw ApiError.forbidden('Please verify your email before continuing.');
    throw ApiError.unauthorized('Wrong email or password.');
  }

  const profile = await getProfileRow(data.user.id);
  if (profile.is_active === false) throw ApiError.forbidden('This account has been suspended.');

  return {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    user: shape(data.user, profile),
  };
}

/**
 * Always returns the same message whether or not the email exists, so this
 * endpoint cannot be used to discover which addresses are registered.
 */
export async function resendVerification(email) {
  const e = validateEmail(email);
  if (!e.ok) throw ApiError.badRequest(e.error, { email: e.error });

  const { error } = await supabase.auth.admin.generateLink({ type: 'recovery', email: e.value });
  if (error && !/not found|does not exist/i.test(error.message))
    throw ApiError.badRequest(error.message);

  return { message: 'If that email is registered, a verification link is on its way.' };
}

export async function getProfileRow(userId) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw ApiError.internal('Could not load your profile.');
  if (!data) throw ApiError.notFound('Profile not found.');
  return data;
}

export async function getUserFromToken(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw ApiError.unauthorized('Your session has expired. Log in again.');
  const profile = await getProfileRow(data.user.id);
  return shape(data.user, profile);
}

/** Real logout: revokes the refresh token server-side, not just in the browser. */
export async function logoutUser(token) {
  if (token) {
    try {
      await supabase.auth.admin.signOut(token);
    } catch (err) {
      console.error('[logout] revoke failed (token may already be dead):', err.message);
    }
  }
  return { message: 'Logged out.' };
}