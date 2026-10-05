import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { uploadResume, deleteResumeFile, signedResumeUrl } from '../config/storage.js';

export async function listResumes(profileId) {
  const { data, error } = await supabase
    .from('resumes').select('*').eq('profile_id', profileId).order('created_at', { ascending: false });
  if (error) throw ApiError.internal('Could not load your resumes.');

  // file_url is a storage PATH, not a public URL - swap in a short-lived one.
  return Promise.all((data || []).map(async (r) => ({
    id: r.id,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    isDefault: r.is_default,
    createdAt: r.created_at,
    downloadUrl: await signedResumeUrl(r.file_url, 300),
  })));
}

export async function addResume({ profileId, file }) {
  const { path, size, mime } = await uploadResume(profileId, file);

  const { count } = await supabase
    .from('resumes').select('id', { count: 'exact', head: true }).eq('profile_id', profileId);

  const { data, error } = await supabase
    .from('resumes')
    .insert({
      profile_id: profileId,
      file_name: file.originalname,
      file_url: path,
      storage_path: path,
      mime_type: mime,
      size_bytes: size,
      is_default: (count || 0) === 0, // first upload becomes the default
    })
    .select().single();
  if (error) {
    await deleteResumeFile(path); // don't leave an orphan in storage
    throw ApiError.internal('Could not save your resume.');
  }
  return { id: data.id, fileName: data.file_name, isDefault: data.is_default, createdAt: data.created_at };
}

export async function deleteResume({ profileId, id }) {
  const { data: resume } = await supabase
    .from('resumes').select('*').eq('id', id).eq('profile_id', profileId).maybeSingle();
  if (!resume) throw ApiError.notFound('Resume not found.');

  const { error } = await supabase.from('resumes').delete().eq('id', id).eq('profile_id', profileId);
  if (error) throw ApiError.internal(error.message);
  await deleteResumeFile(resume.file_url);

  if (resume.is_default) {
    const { data: next } = await supabase
      .from('resumes').select('id').eq('profile_id', profileId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (next) await supabase.from('resumes').update({ is_default: true }).eq('id', next.id);
  }
  return { message: 'Resume deleted.' };
}

export async function setDefaultResume({ profileId, id }) {
  const { data: resume } = await supabase
    .from('resumes').select('id').eq('id', id).eq('profile_id', profileId).maybeSingle();
  if (!resume) throw ApiError.notFound('Resume not found.');

  await supabase.from('resumes').update({ is_default: false }).eq('profile_id', profileId);
  const { error } = await supabase
    .from('resumes').update({ is_default: true }).eq('id', id).eq('profile_id', profileId);
  if (error) throw ApiError.internal(error.message);
  return { message: 'Default resume updated.' };
}