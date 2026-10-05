import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import {
  IconSearch, IconBell, IconMenu, IconX, IconPlus, IconHome,
  IconFile, IconUser, IconGrid, IconLogout, IconBriefcase,
  IconBuilding, IconCheck,
} from './Icon.jsx';

/**
 * Links are built from the ROLE, not hard-coded, because a seeker and an
 * employer need completely different navigation. Showing "Post a job" to a
 * job-seeker is how you get support tickets.
 */
function linksFor(role) {
  if (role === 'admin') {
    return [
      { to: '/jobs', label: 'Jobs' },
      { to: '/admin', label: 'Admin' },
      { to: '/profile', label: 'Profile' },
    ];
  }
  if (role === 'employer') {
    return [
      { to: '/jobs', label: 'Browse jobs' },
      { to: '/dashboard', label: 'My jobs' },
      { to: '/post-job', label: 'Post a job' },
      { to: '/company', label: 'Company' },
      { to: '/profile', label: 'Profile' },
    ];
  }
  return [
    { to: '/jobs', label: 'Jobs' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/saved', label: 'Saved' },
    { to: '/applications', label: 'Applications' },
    { to: '/alerts', label: 'Alerts' },
    { to: '/profile', label: 'Profile' },
  ];
}

/**
 * The four or five destinations shown in the mobile bottom bar.
 *
 * WHY A BOTTOM BAR ON MOBILE: reaching a link in a header that has scrolled off
 * screen means scrolling back up first. Phones are one-handed, so the primary
 * destinations belong where the thumb already is. On desktop this is hidden and
 * the header links take over - the same information, the right shape per device.
 */
function bottomTabsFor(role) {
  const seeker = [
    { to: '/jobs', label: 'Jobs', Icon: IconGrid },
    { to: '/dashboard', label: 'Home', Icon: IconHome },
    { to: '/applications', label: 'Applied', Icon: IconFile },
    { to: '/saved', label: 'Saved', Icon: IconBriefcase },
    { to: '/profile', label: 'Profile', Icon: IconUser },
  ];
  const employer = [
    { to: '/dashboard', label: 'My jobs', Icon: IconHome },
    { to: '/jobs', label: 'Browse', Icon: IconGrid },
    { to: '/post-job', label: 'Post', Icon: IconPlus, accent: true },
    { to: '/company', label: 'Company', Icon: IconBuilding },
    { to: '/profile', label: 'Profile', Icon: IconUser },
  ];
  const admin = [
    { to: '/jobs', label: 'Jobs', Icon: IconGrid },
    { to: '/admin', label: 'Admin', Icon: IconCheck },
    { to: '/profile', label: 'Profile', Icon: IconUser },
  ];
  return role === 'employer' ? employer : role === 'admin' ? admin : seeker;
}

export default function Navbar() {
  const { user, checking, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the drawer whenever the route changes. Otherwise it stays open on
  // top of the page the user just picked from it.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Lock body scroll while the drawer is open, so the page behind does not move.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const handleLogout = async () => {
    setBusy(true);
    await logout();          // clears the session and the in-memory user
    navigate('/login', { replace: true });
  };

  const tabs = checking ? [] : (user ? bottomTabsFor(user.role) : [
    { to: '/jobs', label: 'Jobs', Icon: IconGrid },
    { to: '/login', label: 'Log in', Icon: IconUser },
    { to: '/register', label: 'Sign up', Icon: IconPlus },
  ]);

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link to={user ? '/dashboard' : '/jobs'} className="brand">
            Jobboard
          </Link>

          <nav className="nav-links">
            {checking ? (
              /* Grey pills the exact shape of the real links. Without these the
                 header paints "Log in" first and then swaps to your name a
                 moment later, which reads as a bug even when nothing is wrong. */
              <>
                <span className="nav-ghost" style={{ width: 58 }} />
                <span className="nav-ghost" style={{ width: 92 }} />
                <span className="nav-ghost" style={{ width: 74 }} />
              </>
            ) : user
              ? linksFor(user.role).map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {l.label}
                </NavLink>
              ))
              : <>
                <NavLink to="/jobs" className={({ isActive }) => (isActive ? 'active' : '')}>Jobs</NavLink>
                <NavLink to="/login" className={({ isActive }) => (isActive ? 'active' : '')}>Log in</NavLink>
              </>}
          </nav>

          <div className="nav-actions">
            {checking ? (
              <span className="nav-ghost nav-ghost-round" />
            ) : user ? (
              <>
                <Link to="/jobs" className="icon-btn nav-search" aria-label="Search jobs">
                  <IconSearch size={20} />
                </Link>

                <NotificationBell />

                {user.role === 'employer' && (
                  <Link to="/post-job" className="btn btn-nav">Post a job</Link>
                )}

                <Link to="/profile" className="who" title={user.email}>
                  <span className="avatar" aria-hidden="true">
                    {(user.fullName || user.email || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="who-name">{user.fullName || user.email}</span>
                </Link>

                <button className="btn btn-quiet btn-sm" onClick={handleLogout} disabled={busy}>
                  {busy ? '…' : 'Log out'}
                </button>
              </>
            ) : (
              <Link to="/register" className="btn">Create account</Link>
            )}

            {/* Hamburger - shown on tablet and below, where the link row hides. */}
            <button
              className="icon-btn nav-burger"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <IconMenu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- slide-in drawer ---------- */}
      {menuOpen && (
        <>
          <div className="drawer-scrim" onClick={() => setMenuOpen(false)} />
          <aside className="drawer" role="dialog" aria-label="Menu">
            <div className="drawer-head">
              {user ? (
                <Link to="/profile" className="who">
                  <span className="avatar">{initialsOf(user.fullName || user.email)}</span>
                  <span>
                    <strong className="drawer-name">{user.fullName || user.email}</strong>
                    <span className={`role-tag role-${user.role}`}>{user.role}</span>
                  </span>
                </Link>
              ) : (
                <strong>Jobboard</strong>
              )}
              <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <IconX size={22} />
              </button>
            </div>

            <nav className="drawer-links">
              {(user ? linksFor(user.role) : [{ to: '/jobs', label: 'Browse jobs' }, { to: '/login', label: 'Log in' }])
                .map((l) => (
                  <NavLink key={l.to} to={l.to} className="drawer-link">{l.label}</NavLink>
                ))}
              {user && user.role === 'seeker' && (
                <NavLink to="/alerts" className="drawer-link">Job alerts</NavLink>
              )}
            </nav>

            <div className="drawer-foot">
              {user ? (
                <button className="btn btn-quiet btn-block" onClick={handleLogout} disabled={busy}>
                  <IconLogout size={18} /> {busy ? 'Signing out…' : 'Log out'}
                </button>
              ) : (
                <Link to="/register" className="btn btn-block">Create account</Link>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ---------- mobile bottom tab bar ---------- */}
      <nav className="tabbar" aria-label="Main">
        {tabs.map(({ to, label, Icon, accent }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `tab ${isActive ? 'on' : ''} ${accent ? 'tab-accent' : ''}`}
          >
            <span className="tab-icon"><Icon size={accent ? 24 : 22} /></span>
            <span className="tab-label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

function initialsOf(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';
}
