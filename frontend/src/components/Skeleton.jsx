import { Link } from 'react-router-dom';

/**
 * Named (not default) exports only.
 *
 * WHY: pages import from here by name - `import { Skeleton, ErrorState }`.
 * A `default` export alongside named ones is the easiest way to end up with
 * two ways to import the same component, and half the imports wrong.
 */

/** Grey placeholder blocks shown while data loads. */
export function Skeleton({ lines = 3, height = '1rem' }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height, width: `${100 - i * 12}%`, marginBottom: i === lines - 1 ? 0 : '.6rem' }}
        />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 4 }) {
  return (
    <div className="list">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} lines={2} />)}
    </div>
  );
}

/**
 * Shown when a request worked but there is nothing to display.
 * This is different from an error: an empty list is not a failure.
 */
export function EmptyState({ title, message, actionLabel, actionTo, onAction, icon = '📭' }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      {message && <p className="muted">{message}</p>}
      {actionTo && <Link className="btn" to={actionTo}>{actionLabel}</Link>}
      {onAction && <button className="btn" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

/** Shown when a request failed. Always offers a way out. */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">⚠️</div>
      <h2>Something went wrong</h2>
      <p className="error">{message}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}
