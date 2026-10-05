import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from './Modal.jsx';
import Field, { TextInput, TextArea, Select, Checkbox } from './Field.jsx';
import { IconCheck, IconUpload } from './Icon.jsx';

/**
 * The apply form, shared by the job page and every job card.
 *
 * WHY IT IS ITS OWN FILE: the same 90-line form was about to exist twice - once
 * in JobDetails and once in a quick-apply modal on the cards. Two copies drift:
 * someone adds a new question type to one and forgets the other, and half the
 * jobs on the site become un-appliable. One file, one behaviour.
 *
 * IT SELF-LOADS what it needs (questions + resumes) when it opens, so a card
 * that is clicked in a list of twelve does not need the parent to preload it.
 */
export default function ApplyModal({ job, open, onClose, onApplied }) {
  const toast = useToast();

  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [answers, setAnswers] = useState({});
  const [form, setForm] = useState({
    coverLetter: '',
    expectedSalary: '',
    noticePeriod: '',
    currentLocation: '',
    resumeId: '',
    remoteOk: true,
  });

  // Load only when the modal opens, so browsing the list stays fast.
  useEffect(() => {
    if (!open || !job?.id) return;
    let cancelled = false;
    setPreparing(true);
    setAnswers({});

    const work = [
      api.getJobQuestions(job.id)
        .then((d) => { if (!cancelled) setQuestions(d.questions || []); })
        .catch(() => {}),
      api.getResumes()
        .then((d) => {
          if (cancelled) return;
          const list = d.resumes || [];
          setResumes(list);
          // Pre-pick the default resume so the common case is one tap.
          const preferred = list.find((r) => r.isDefault) || list[0];
          setForm((f) => ({ ...f, resumeId: preferred?.id || '' }));
        })
        .catch(() => {}),
    ];

    Promise.all(work).finally(() => { if (!cancelled) setPreparing(false); });
    return () => { cancelled = true; };
  }, [open, job?.id]);

  const setAnswer = (qid, value) => setAnswers((a) => ({ ...a, [qid]: value }));

  /** Required questions must be answered before sending, or the server 400s. */
  const missing = questions.filter((q) => q.is_required && !String(answers[q.id] ?? '').trim());

  const submit = async (e) => {
    e.preventDefault();
    if (missing.length) {
      toast.error(`Please answer: "${missing[0].question}"`);
      return;
    }
    setSending(true);
    try {
      await api.apply({
        jobId: job.id,
        coverLetter: form.coverLetter.trim() || undefined,
        expectedSalary: form.expectedSalary.trim() || undefined,
        noticePeriod: form.noticePeriod.trim() || undefined,
        currentLocation: form.currentLocation.trim() || undefined,
        resumeId: form.resumeId || undefined,
        answers: questions.map((q) => ({
          questionId: q.id,
          question: q.question,
          answer: answers[q.id] ?? '',
        })),
      });
      toast.success('Application sent.');
      onApplied?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Apply Â· ${job?.title || ''}`} size="wide">
      {preparing && <p className="muted">Preparing the formâ€¦</p>}

      {!preparing && (
        <form onSubmit={submit} noValidate className="form">
          {/* ---------- employer questions ---------- */}
          {questions.length > 0 && (
            <fieldset className="questions">
              <legend>A few questions from the employer</legend>
              {questions.map((q) => (
                <Field
                  key={q.id}
                  label={q.question}
                  required={q.is_required}
                  htmlFor={`q-${q.id}`}
                >
                  {q.type === 'textarea' ? (
                    <TextArea id={`q-${q.id}`} name={`q-${q.id}`} value={answers[q.id] || ''}
                      onChange={(_, v) => setAnswer(q.id, v)} />
                  ) : q.type === 'select' ? (
                    <Select id={`q-${q.id}`} name={`q-${q.id}`} value={answers[q.id] || ''}
                      placeholder="Chooseâ€¦" onChange={(_, v) => setAnswer(q.id, v)}
                      options={q.options || []} />
                  ) : q.type === 'boolean' ? (
                    <Checkbox id={`q-${q.id}`} name={`q-${q.id}`}
                      checked={answers[q.id] === true || answers[q.id] === 'true'}
                      onChange={(_, v) => setAnswer(q.id, v)}
                      label={q.options?.[0] || 'Yes'} />
                  ) : (
                    <TextInput id={`q-${q.id}`} name={`q-${q.id}`}
                      type={q.type === 'number' ? 'number' : 'text'}
                      value={answers[q.id] ?? ''}
                      onChange={(_, v) => setAnswer(q.id, v)} />
                  )}
                </Field>
              ))}
            </fieldset>
          )}

          {/* ---------- resume ---------- */}
          <div className="resume-picker">
            <div className="row-between">
              <span className="field-label">Resume</span>
              <Link className="btn btn-quiet btn-sm" to="/profile">
                <IconUpload size={16} /> Upload
              </Link>
            </div>

            {resumes.length === 0 ? (
              <p className="muted small">
                You have not uploaded a resume yet.{' '}
                <Link to="/profile">Upload one</Link> - employers can only download a resume
                if you attach it.
              </p>
            ) : (
              <div className="resume-checks">
                {resumes.map((r) => (
                  <label key={r.id} className={`resume-check ${form.resumeId === r.id ? 'on' : ''}`}>
                    <input
                      type="radio"
                      name="resumeId"
                      value={r.id}
                      checked={form.resumeId === r.id}
                      onChange={() => setForm((f) => ({ ...f, resumeId: r.id }))}
                    />
                    <span className="resume-check-name">{r.fileName}</span>
                    {r.isDefault && <span className="pill pill-muted">Default</span>}
                    {form.resumeId === r.id && <IconCheck size={16} />}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ---------- letter + details ---------- */}
          <Field
            label="Cover letter"
            hint="Optional, but candidates with one get roughly twice as many replies."
            htmlFor="coverLetter"
          >
            <TextArea id="coverLetter" name="coverLetter" rows={5} value={form.coverLetter}
              onChange={(_, v) => setForm((f) => ({ ...f, coverLetter: v }))}
              placeholder={`Why are you a good fit for ${job?.title || 'this role'}?`} />
          </Field>

          <div className="grid">
            <Field label="Expected salary" htmlFor="expectedSalary">
              <TextInput id="expectedSalary" name="expectedSalary" value={form.expectedSalary}
                onChange={(_, v) => setForm((f) => ({ ...f, expectedSalary: v }))}
                placeholder="12 LPA" />
            </Field>
            <Field label="Notice period" htmlFor="noticePeriod">
              <TextInput id="noticePeriod" name="noticePeriod" value={form.noticePeriod}
                onChange={(_, v) => setForm((f) => ({ ...f, noticePeriod: v }))}
                placeholder="30 days" />
            </Field>
            <Field label="Current location" htmlFor="currentLocation">
              <TextInput id="currentLocation" name="currentLocation" value={form.currentLocation}
                onChange={(_, v) => setForm((f) => ({ ...f, currentLocation: v }))}
                placeholder="Bengaluru" />
            </Field>
          </div>

          <div className="row">
            <button className="btn btn-lg" disabled={sending || preparing}>
              {sending ? 'Sendingâ€¦' : 'Send application'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
