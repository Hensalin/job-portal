import { useState } from 'react';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Field, { TextInput, TextArea, Checkbox } from './Field.jsx';
import { ConfirmModal } from './Modal.jsx';

/**
 * One editor per repeatable profile section (education, experience,
 * certifications).
 *
 * WHY THIS IS A CONFIG AND NOT THREE COMPONENTS: all three do exactly the same
 * four things - list, add, edit, delete. Only the fields differ. Writing three
 * near-identical files means a bug fix has to be applied three times, and one
 * copy gets missed.
 *
 * Field names are snake_case because that is what the API expects:
 *   field_of_study, credential_url, is_current, sort_order
 * The backend validates all of them again.
 */
const CONFIG = {
  education: {
    title: 'Education',
    addLabel: 'Add education',
    empty: 'No education added yet.',
    fields: [
      { name: 'institution', label: 'Institution', required: true, span: 2 },
      { name: 'degree', label: 'Degree' },
      { name: 'field_of_study', label: 'Field of study' },
      { name: 'start_year', label: 'Start year', type: 'number', min: 1950, max: 2100 },
      { name: 'end_year', label: 'End year', type: 'number', min: 1950, max: 2100 },
      { name: 'grade', label: 'Grade / CGPA' },
      { name: 'description', label: 'Notes', type: 'textarea', span: 2 },
    ],
    render: (row) => (
      <>
        <strong>{row.degree || row.institution}</strong>
        {row.degree && <span className="muted"> · {row.institution}</span>}
        <span className="muted small">
          {' '}
          {[row.field_of_study, row.start_year, row.end_year && `– ${row.end_year}`, row.grade]
            .filter(Boolean).join(' · ')}
        </span>
        {row.description && <p className="muted small">{row.description}</p>}
      </>
    ),
  },

  experience: {
    title: 'Work experience',
    addLabel: 'Add a role',
    empty: 'No work experience added yet.',
    fields: [
      { name: 'title', label: 'Job title', required: true },
      { name: 'company', label: 'Company', required: true },
      { name: 'location', label: 'Location' },
      { name: 'start_date', label: 'Start date', type: 'date' },
      { name: 'end_date', label: 'End date', type: 'date' },
      { name: 'description', label: 'What you did', type: 'textarea', span: 2 },
    ],
    hasCurrent: true,
    render: (row) => (
      <>
        <strong>{row.title}</strong> <span className="muted">at {row.company}</span>
        <span className="muted small">
          {' '}
          {row.start_date?.slice(0, 7)} → {row.is_current ? 'Present' : row.end_date?.slice(0, 7) || '—'}
          {row.location && ` · ${row.location}`}
        </span>
        {row.description && <p className="muted small prewrap">{row.description}</p>}
      </>
    ),
  },

  certifications: {
    title: 'Certifications',
    addLabel: 'Add certification',
    empty: 'No certifications added yet.',
    fields: [
      { name: 'name', label: 'Certificate name', required: true, span: 2 },
      { name: 'issuer', label: 'Issuing organisation' },
      { name: 'issued_on', label: 'Issued on', type: 'date' },
      { name: 'credential_url', label: 'Credential link', type: 'url', span: 2 },
    ],
    render: (row) => (
      <>
        <strong>{row.name}</strong>
        {row.issuer && <span className="muted"> · {row.issuer}</span>}
        {row.issued_on && <span className="muted small"> · {row.issued_on}</span>}
        {row.credential_url && (
          <> · <a href={row.credential_url} target="_blank" rel="noreferrer noopener">View</a></>
        )}
      </>
    ),
  },
};

const blank = (fields) =>
  Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : '']));

export default function SectionEditor({ kind, rows, onChange }) {
  const cfg = CONFIG[kind];
  const toast = useToast();

  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [form, setForm] = useState(() => blank(cfg.fields));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  /**
   * Re-read only this section and hand the rows up.
   *
   * WHY NOT onChange() WITH NO ARGUMENT: the parent used to treat that as
   * "reload the entire profile". Reloading sets loading=true, which unmounts
   * the basic-details form and refills it from the server - so adding one line
   * of work history silently discarded every unsaved field. Saving a work
   * entry should not cost you your bio.
   */
  const syncRows = async () => {
    try {
      onChange(await api.listSection(kind) || []);
    } catch {
      // Leave the current rows visible rather than blanking the section.
    }
  };

  const startAdd = () => {
    setForm({ ...blank(cfg.fields), ...(kind === 'experience' ? { is_current: false } : {}) });
    setErrors({});
    setEditing('new');
  };

  const startEdit = (row) => {
    setForm({ ...blank(cfg.fields), ...row });
    setErrors({});
    setEditing(row);
  };

  const change = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  /**
   * An end date after the start date is the one mistake users make constantly,
   * so it is caught here rather than sent to the server.
   */
  const validate = () => {
    const e = {};
    for (const f of cfg.fields) {
      if (f.required && !String(form[f.name] || '').trim()) e[f.name] = `${f.label} is required.`;
    }
    const start = form.start_date || form.start_year;
    const end = form.end_date || form.end_year;
    if (start && end && String(end) < String(start)) e[kind === 'education' ? 'end_year' : 'end_date'] = 'End must be after the start.';
    return e;
  };

  const save = async (ev) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form)
          .filter(([, v]) => v !== '' && v !== false && v !== undefined)
          .map(([k, v]) => [k, k === 'sort_order' ? Number(v) : v])
      );
      payload.sort_order = rows.length;

      if (editing === 'new') {
        await api.addSection(kind, payload);
        toast.success(`${cfg.title.replace(/s$/, '')} added.`);
      } else {
        await api.updateSection(kind, editing.id, payload);
        toast.success('Saved.');
      }
      setEditing(null);
      await syncRows();
    } catch (err) {
      if (err.details) setErrors(err.details);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.deleteSection(kind, deleting.id);
      toast.success('Deleted.');
      setDeleting(null);
      await syncRows();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>{cfg.title}</h2>
        <button className="btn btn-quiet" onClick={startAdd} disabled={editing !== null}>
          {cfg.addLabel}
        </button>
      </div>

      {rows.length === 0 && editing === null && <p className="muted pad">{cfg.empty}</p>}

      <ul className="plain section-list">
        {rows.map((row) => (
          <li key={row.id} className={editing === row ? 'editing' : ''}>
            <div className="section-body">{cfg.render(row)}</div>
            <div className="row">
              <button className="btn btn-quiet btn-sm" onClick={() => startEdit(row)} disabled={editing !== null && editing !== row}>
                Edit
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleting(row)} disabled={editing !== null}>
                Delete
              </button>
            </div>

            {editing === row && (
              <form className="form section-form" onSubmit={save} noValidate>
                <div className="grid">
                  {cfg.fields.map((f) => (
                    <div key={f.name} style={f.span === 2 ? { gridColumn: '1 / -1' } : undefined}>
                      <Field label={f.label} required={f.required} error={errors[f.name]} htmlFor={`${kind}-${f.name}`}>
                        {f.type === 'textarea' ? (
                          <TextArea id={`${kind}-${f.name}`} name={f.name} value={form[f.name]}
                            onChange={change} error={errors[f.name]} rows={3} />
                        ) : (
                          <TextInput id={`${kind}-${f.name}`} name={f.name} type={f.type || 'text'}
                            min={f.min} max={f.max} value={form[f.name]}
                            onChange={change} error={errors[f.name]} />
                        )}
                      </Field>
                    </div>
                  ))}
                </div>

                {cfg.hasCurrent && (
                  <Checkbox
                    name="is_current" checked={!!form.is_current}
                    onChange={(_, v) => change('is_current', v)}
                    label="I currently work here"
                  />
                )}

                <div className="row">
                  <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' && (
        <form className="form section-form" onSubmit={save} noValidate>
          <div className="grid">
            {cfg.fields.map((f) => (
              <div key={f.name} style={f.span === 2 ? { gridColumn: '1 / -1' } : undefined}>
                <Field label={f.label} required={f.required} error={errors[f.name]} htmlFor={`new-${kind}-${f.name}`}>
                  {f.type === 'textarea' ? (
                    <TextArea id={`new-${kind}-${f.name}`} name={f.name} value={form[f.name]}
                      onChange={change} error={errors[f.name]} rows={3} />
                  ) : (
                    <TextInput id={`new-${kind}-${f.name}`} name={f.name} type={f.type || 'text'}
                      min={f.min} max={f.max} value={form[f.name]}
                      onChange={change} error={errors[f.name]} />
                  )}
                </Field>
              </div>
            ))}
          </div>

          {cfg.hasCurrent && (
            <Checkbox name="is_current" checked={!!form.is_current}
              onChange={(_, v) => change('is_current', v)} label="I currently work here" />
          )}

          <div className="row">
            <button className="btn" disabled={saving}>{saving ? 'Saving…' : `Add ${cfg.title.replace(/s$/, '').toLowerCase()}`}</button>
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <ConfirmModal
        open={!!deleting}
        title={`Delete this ${cfg.title.replace(/s$/, '').toLowerCase()} entry?`}
        message="This cannot be undone."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}