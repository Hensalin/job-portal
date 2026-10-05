import { useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { ConfirmModal } from './Modal.jsx';
import { timeAgo } from './JobCard.jsx';

const MAX_MB = 5;
const ALLOWED = ['.pdf', '.doc', '.docx'];

/**
 * Upload, set default, delete resumes.
 *
 * WHY A REF AND NOT A LABEL: a label cannot be styled and cannot show the
 * chosen file name. The ref gives us the real file so we can validate its
 * size and type BEFORE uploading - uploading a 40MB video and failing
 * afterwards wastes the user's time and bandwidth.
 *
 * The server validates the same things again. Always validate on both sides.
 *
 * onChange ALWAYS receives the new resume array - never nothing. It used to be
 * called as onChange() after upload and delete, and the parent treated "no
 * argument" as "reload the whole page". That set loading=true, which unmounted
 * the profile form and then repopulated it from the server - so uploading a
 * resume silently threw away every field the user had typed but not saved.
 * A resume change is a resume change; it has no business touching the form.
 */
export default function ResumeManager({ resumes, onChange }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  /** Pull just the resume list and hand it up. Deliberately scoped. */
  const syncResumes = async () => {
    try {
      const d = await api.getResumes();
      onChange(d.resumes || []);
    } catch {
      // Keep the previous list on screen rather than blanking it.
    }
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    e.target.value = '';
    if (!file) return;

    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!ALLOWED.includes(ext)) {
      return toast.error(`Only ${ALLOWED.join(', ')} files are accepted.`);
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return toast.error(`That file is ${(file.size / 1048576).toFixed(1)}MB. The limit is ${MAX_MB}MB.`);
    }

    setUploading(true);
    try {
      await api.uploadResume(file);
      toast.success('Resume uploaded.');
      if (inputRef.current) inputRef.current.value = '';
      await syncResumes();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const setDefault = async (r) => {
    const snapshot = resumes;
    onChange(snapshot.map((x) => ({ ...x, isDefault: x.id === r.id })));
    try {
      await api.setDefaultResume(r.id);
    } catch (err) {
      onChange(snapshot);
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.deleteResume(deleting.id);
      toast.success('Resume deleted.');
      setDeleting(null);
      await syncResumes();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Resumes</h2>
      <p className="muted small">
        Employers can only download resumes you attach to an application. Files are stored privately.
      </p>

      <div className="upload-row">
        <input
          ref={inputRef}
          type="file"
          id="resume-file"
          accept={ALLOWED.join(',')}
          onChange={pick}
          className="file-input"
          aria-label="Choose a resume file"
        />
        <label htmlFor="resume-file" className="btn btn-quiet">
          {uploading ? 'Uploadingâ€¦' : 'Choose file'}
        </label>
        <span className="muted small">PDF or Word, up to {MAX_MB}MB.</span>
      </div>

      {resumes.length === 0 && (
        <p className="muted pad">No resume uploaded yet.</p>
      )}

      <ul className="plain resume-list">
        {resumes.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{r.fileName}</strong>
              {r.isDefault && <span className="pill pill-good">Default</span>}
              <span className="muted small">
                {' '}
                {r.sizeBytes ? `${Math.round(r.sizeBytes / 1024)}KB · ` : ''}
                {timeAgo(r.createdAt)}
              </span>
            </div>
            <div className="row">
              {!r.isDefault && (
                <button className="btn btn-quiet btn-sm" onClick={() => setDefault(r)}>Make default</button>
              )}
              <button className="btn btn-danger btn-sm" onClick={() => setDeleting(r)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmModal
        open={!!deleting}
        title="Delete this resume?"
        message={`"${deleting?.fileName}" will be removed permanently. Applications already sent with it keep a copy of the file name.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}