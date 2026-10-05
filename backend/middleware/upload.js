import multer from 'multer';

/**
 * Resume uploads use MEMORY storage, not disk.
 * WHY: we must inspect mimetype AND size before anything is persisted, and we
 * stream the buffer straight to Supabase Storage. Never write user uploads to
 * the server's filesystem.
 */
const MAX_BYTES = 5 * 1024 * 1024;

export const uploadResumeFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    // Supabase Storage is the real authority, but rejecting here saves the
    // upload entirely and produces a much clearer error message.
    const ok = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].includes(file.mimetype);
    if (!ok) return cb(Object.assign(new Error('Only PDF, DOC and DOCX files are allowed.'), { status: 400 }));
    cb(null, true);
  },
}).single('file');

export { MAX_BYTES };
