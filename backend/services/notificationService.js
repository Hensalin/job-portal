import supabase from '../config/supabase.js';

/**
 * Every notification is created through here so the shape stays consistent.
 * Failures are logged but never thrown - a failed notification must not roll
 * back the action that triggered it (e.g. a successful application).
 */
export async function notify({ profileId, type, title, body = null, link = null }) {
  if (!profileId) return null;
  const { error } = await supabase.from('notifications').insert({
    profile_id: profileId,
    type, title, body, link,
  });
  if (error) console.error('[notify] failed:', error.message);
  return !error;
}

/** Fan-out helper. */
export async function notifyMany(profileIds, payload) {
  await Promise.all(profileIds.filter(Boolean).map((id) => notify({ profileId: id, ...payload })));
}

/**
 * Notifications are the one place this used to leak raw database rows
 * (profile_id, is_read, created_at) into the API. Every other endpoint maps to
 * camelCase, so the React side had two different naming conventions to remember
 * and every `n.created_at` was one rename away from silently rendering
 * "Invalid Date". Mapped here so the whole API speaks one language.
 */
function shapeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    isRead: row.is_read ?? false,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function listNotifications(profileId, { limit = 30 } = {}) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(shapeNotification);
}

export async function unreadCount(profileId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('is_read', false);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function markRead(profileId, id) {
  const q = supabase.from('notifications').update({ is_read: true }).eq('profile_id', profileId);
  const { error } = id ? await q.eq('id', id) : await q.eq('is_read', false);
  if (error) throw new Error(error.message);
}

export async function markAllRead(profileId) {
  const { error } = await supabase
    .from('notifications').update({ is_read: true })
    .eq('profile_id', profileId).eq('is_read', false);
  if (error) throw new Error(error.message);
}