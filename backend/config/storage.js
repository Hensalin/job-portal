import supabase from './supabase.js';

const BUCKET = 'resumes';

export const RESUME_BUCKET = BUCKET;

const ALLOWED_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateResumeFile(file) {
  if (!file) return { ok: false, error: 'No file was uploaded.' };
  if (!ALLOWED_TYPES[file.mimetype])
    return { ok: false, error: 'Only PDF, DOC and DOCX files are allowed.' };
  if (file.size > MAX_BYTES)
    return { ok: false, error: 'File is too large. Maximum size is 5 MB.' };
  if (file.size === 0) return { ok: false, error: 'The uploaded file is empty.' };
  return { ok: true, ext: ALLOWED_TYPES[file.mimetype] };
}

/** path = <profileId>/<timestamp>-<safeName> — the RLS policy keys off folder [0]. */
function buildPath(profileId, originalName, ext) {
  const safe = String(originalName || 'resume')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(-60);
  return `${profileId}/${Date.now()}-${safe}${ext}`;
}

export async function uploadResume(profileId, file) {
  const check = validateResumeFile(file);
  if (!check.ok) throw new Error(check.error);

  const path = buildPath(profileId, file.originalname, check.ext);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw new Error(error.message);

  return { path, size: file.size, mime: file.mimetype };
}

/**
 * The bucket is PRIVATE, so we never store or hand out a public URL.
 * Every read goes through a short-lived signed URL.
 */
export async function signedResumeUrl(path, expiresIn = 300) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteResumeFile(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}