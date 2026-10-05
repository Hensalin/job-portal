import supabase from '../config/supabase.js';

export async function registerUser({ email, password, fullName, role }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification (training setup)
  });
  if (error) throw new Error(error.message);

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: data.user.id, full_name: fullName, role });

  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id); // roll back
    throw new Error(profileError.message);
  }
  return { id: data.user.id, email, fullName, role };
}

export async function loginUser({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Wrong email or password.');

  const profile = await getProfile(data.user.id);
  return {
    token: data.session.access_token,
    user: { id: data.user.id, email: data.user.email, fullName: profile.full_name, role: profile.role },
  };
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw new Error('Profile not found.');
  return data;
}

export async function getUserFromToken(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid token');
  const profile = await getProfile(data.user.id);
  return { id: data.user.id, email: data.user.email, fullName: profile.full_name, role: profile.role };
}
