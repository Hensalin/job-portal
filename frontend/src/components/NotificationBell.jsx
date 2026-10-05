import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { timeAgo } from './JobCard.jsx';

/**
 * The bell in the navbar.
 *
 * WHY POLLING INSTEAD OF WEBSOCKETS: a websocket needs a second connection, a
 * reconnect strategy, and a server that stays online. For unread counts that is
 * not worth it. Polling every 60s costs nothing and is good enough.
 *
 * WHY IT STOPS WHEN THE TAB IS HIDDEN: a background tab polling every minute
 * wastes battery and can hit rate limits.
 */
const POLL_MS = 60_000;

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  const load = useCallback(async ({ silent } = {}) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const data = await api.getNotifications();
      setItems(data.notifications || []);
    } catch {
      // A failed bell must never break the page. Stay quiet.
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => { load({ silent: true }); }, [load]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') load({ silent: true }); };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  // Close the dropdown when clicking anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const unread = items.filter((n) => !n.isRead).length;

  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try { await api.markAllNotificationsRead(); }
    catch { load(); } // Put the real state back if the server refused.
  };

  const openOne = async (n) => {
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      api.markNotificationRead(n.id).catch(() => load());
    }
    setOpen(false);
  };

  return (
    <div className="bell-wrap" ref={boxRef}>
      <button
        className="bell"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-drop" role="dialog" aria-label="Notifications">
          <header className="bell-drop-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="btn btn-quiet btn-sm" onClick={markAll}>Mark all read</button>
            )}
          </header>

          <div className="bell-list">
            {loading && <p className="muted pad">Loading…</p>}
            {!loading && items.length === 0 && <p className="muted pad">Nothing yet.</p>}
            {!loading && items.map((n) => (
              <div key={n.id} className={`bell-item ${n.isRead ? '' : 'unread'}`}>
                <Link to={n.link || '/notifications'} onClick={() => openOne(n)}>
                  <strong>{n.title}</strong>
                  {n.body && <span className="bell-body">{n.body}</span>}
                  <span className="muted small">{timeAgo(n.createdAt)}</span>
                </Link>
              </div>
            ))}
          </div>

          <footer className="bell-drop-foot">
            <Link to="/notifications" onClick={() => setOpen(false)}>View all</Link>
          </footer>
        </div>
      )}
    </div>
  );
}