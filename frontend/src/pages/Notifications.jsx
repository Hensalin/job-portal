import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { SkeletonList, EmptyState, ErrorState } from '../components/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { timeAgo } from '../components/JobCard.jsx';

/** Groups the flat list by calendar day so long histories stay readable. */
function groupByDay(items) {
  const out = [];
  let lastDay = null;
  for (const n of items) {
    const day = new Date(n.createdAt).toDateString();
    if (day !== lastDay) {
      out.push({ day, label: dayLabel(n.createdAt), items: [] });
      lastDay = day;
    }
    out[out.length - 1].items.push(n);
  }
  return out;
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Notifications() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getNotifications();
      setItems(data.notifications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAll = async () => {
    const snapshot = items;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await api.markAllNotificationsRead();
      toast.success('All marked as read.');
    } catch (err) {
      setItems(snapshot);   // the server disagreed, so show the real state
      toast.error(err.message);
    }
  };

  const markOne = async (n) => {
    if (n.isRead) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    api.markNotificationRead(n.id).catch(() => load());
  };

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">{unread ? `${unread} unread` : 'You are all caught up.'}</p>
        </div>
        {unread > 0 && (
          <button className="btn btn-quiet" onClick={markAll}>Mark all as read</button>
        )}
      </header>

      {loading && <SkeletonList count={4} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon="🔔"
          title="Nothing here yet"
          message="You will be told when an employer views your application, when you are shortlisted, and when a job alert finds a match."
          actionTo="/jobs"
          actionLabel="Browse jobs"
        />
      )}

      {groupByDay(items).map((group) => (
        <section key={group.day + group.label} className="notif-day">
          <h2 className="day-label">{group.label}</h2>
          <div className="list">
            {group.items.map((n) => (
              <article key={n.id} className={`card notif ${n.isRead ? '' : 'unread'}`}>
                <div>
                  <h3>{n.title}</h3>
                  {n.body && <p className="muted">{n.body}</p>}
                  <p className="small muted">{timeAgo(n.createdAt)}</p>
                </div>
                <div className="row">
                  {n.link && (
                    <Link className="btn btn-quiet" to={n.link} onClick={() => markOne(n)}>View</Link>
                  )}
                  {!n.isRead && (
                    <button className="btn btn-quiet" onClick={() => markOne(n)}>Mark read</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}