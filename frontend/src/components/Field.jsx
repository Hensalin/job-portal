/**
 * A labelled form field that shows validation errors and hints.
 *
 * WHY A COMPONENT: without it, every form repeats the same label + error +
 * id + aria wiring, and people forget the aria bits, which breaks screen
 * readers. Using this makes it automatic.
 */
/**
 * Coerces an error value into something React can safely render.
 *
 * WHY THIS EXISTS: several validators return an OBJECT - { ok: true, value } or
 * { ok: false, error }. Code like `if (validateEmail(x)) errors.email =
 * validateEmail(x)` stored that object as the error, because an object is
 * always truthy. Field then handed the object to React as a child, React threw
 * "Objects are not valid as a React child", and the error boundary unmounted
 * the entire page - a white screen from one bad assignment.
 *
 * A field that cannot render its error is still a usable field, so degrade to
 * a generic message instead of taking the page down with it.
 */
function safeText(value, fallback) {
  if (value === null || value === undefined || value === false || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join(' ');
  if (typeof value === 'object') return value.error || value.message || fallback;
  return String(value);
}

export default function Field({
  label,
  error,
  hint,
  children,
  required,
  htmlFor,
}) {
  // Coerce here, once, so no caller can hand us something unrenderable.
  const errText = safeText(error, 'This value is not valid.');
  const hintText = safeText(hint, '');

  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hintText && !errText && <span className="field-hint">{hintText}</span>}
      {errText && <span className="field-error" role="alert">{errText}</span>}
    </label>
  );
}

/** Simple text input bound to a field name. */
export function TextInput({ name, value, onChange, error, type = 'text', placeholder, autoComplete, ...rest }) {
  return (
    <input
      id={name}
      name={name}
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      autoComplete={autoComplete}
      // aria-invalid tells assistive tech this field is in an error state.
      aria-invalid={error ? 'true' : undefined}
      onChange={(e) => onChange(name, e.target.value)}
      className={error ? 'has-error' : ''}
      {...rest}
    />
  );
}

export function TextArea({ name, value, onChange, error, rows = 4, placeholder, ...rest }) {
  return (
    <textarea
      id={name}
      name={name}
      rows={rows}
      value={value ?? ''}
      placeholder={placeholder}
      aria-invalid={error ? 'true' : undefined}
      onChange={(e) => onChange(name, e.target.value)}
      className={error ? 'has-error' : ''}
      {...rest}
    />
  );
}

export function Select({ name, value, onChange, error, options = [], placeholder, ...rest }) {
  return (
    <select
      id={name}
      name={name}
      value={value ?? ''}
      aria-invalid={error ? 'true' : undefined}
      onChange={(e) => onChange(name, e.target.value)}
      className={error ? 'has-error' : ''}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return <option key={val} value={val}>{label}</option>;
      })}
    </select>
  );
}

/** Multi-value input: user types "React, CSS" and it becomes ["React","CSS"]. */
export function TagsInput({ name, value, onChange, error, placeholder = 'React, CSS, Node.js', hint }) {
  const list = Array.isArray(value) ? value : String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <>
      <input
        id={name}
        name={name}
        defaultValue={list.join(', ')}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        className={error ? 'has-error' : ''}
        onBlur={(e) => onChange(name, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        onKeyDown={(e) => {
          // Enter should not submit the whole form while typing tags.
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        }}
      />
      {hint && !error && <span className="field-hint">{hint}</span>}
      {list.length > 0 && (
        <div className="tag-preview">
          {list.map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
    </>
  );
}

export function Checkbox({ name, checked, onChange, label }) {
  return (
    <label className="check">
      <input
        id={name}
        name={name}
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(name, e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
