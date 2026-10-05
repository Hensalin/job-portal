import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Gate for pages that need a logged-in user.
 *
 * TWO THINGS IT GETS RIGHT THAT THE OLD VERSION DID NOT:
 *
 * 1. It waits for `checking`. The old version read localStorage on first paint
 *    and redirected to /login before the token had even been validated, so a
 *    page refresh on a slow connection threw you out.
 *
 * 2. It remembers where you were going via `state.from`, so after logging in
 *    you land back on the page you asked for instead of the homepage.
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, checking } = useAuth();
  const location = useLocation();

  if (checking) {
    return <div className="page-loading"><span className="spinner" aria-hidden="true" />Checking your session…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // `roles` is optional. Without it this is just "must be logged in".
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">🔒</div>
        <h2>You do not have access to this page</h2>
        <p className="muted">
          This page is for <strong>{roles.join(' or ')}</strong> accounts. You are signed in as{' '}
          <strong>{user.role}</strong>.
        </p>
        <LinkBack />
      </div>
    );
  }

  return children;
}

function LinkBack() {
  return (
    <a className="btn" href="/dashboard">Go to my dashboard</a>
  );
}