import supabase from '../config/supabase.js';

export async function listJobs({ search, type }) {
  let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });
  if (type) query = query.eq('type', type);
  if (search) {
    const s = search.replace(/[,()]/g, ' ');
    query = query.or(`title.ilike.%${s}%,company.ilike.%${s}%,location.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getJob(id) {
  const { data, error } = await supabase.from('jobs').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

export async function listJobsByEmployer(employerId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, applications(count)')
    .eq('employer_id', employerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createJob(employerId, fields) {
  const { title, company, location, type, salary, description } = fields;
  const { data, error } = await supabase
    .from('jobs')
    .insert({ employer_id: employerId, title, company, location, type, salary, description })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateJob(id, fields) {
  const { title, company, location, type, salary, description } = fields;
  const { data, error } = await supabase
    .from('jobs')
    .update({ title, company, location, type, salary, description })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteJob(id) {
  const { error } = await supabase.from('jobs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
