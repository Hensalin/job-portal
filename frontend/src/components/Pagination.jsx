import { useEffect } from 'react';

/**
 * Page buttons.
 *
 * WHY NOT JUST A "next" BUTTON: the backend returns `totalPages`. Showing the
 * count tells the user how much data exists, and lets them jump back and forth
 * instead of clicking next 14 times.
 */
export default function Pagination({ page, totalPages, onChange, className = '' }) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  if (!totalPages || totalPages <= 1) return null;

  // Show at most 7 numbers, with null meaning "an ellipsis".
  const pages = [];
  const push = (p) => pages.push(p);
  push(1);
  if (page > 3) push('…L');
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) push(p);
  if (page < totalPages - 2) push('…R');
  if (totalPages > 1) push(totalPages);

  return (
    <nav className={`pagination ${className}`} aria-label="Pagination">
      <button className="btn btn-quiet" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>

      {pages.map((p, i) =>
        typeof p === 'number' ? (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`page-num ${p === page ? 'active' : ''}`}
          >
            {p}
          </button>
        ) : (
          <span key={p + i} className="page-gap" aria-hidden="true">…</span>
        )
      )}

      <button className="btn btn-quiet" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}