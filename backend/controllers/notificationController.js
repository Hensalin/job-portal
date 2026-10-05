import * as notificationService from '../services/notificationService.js';
import { ApiError } from '../utils/ApiError.js';

export async function list(req, res, next) {
  try {
    const [notifications, unread] = await Promise.all([
      notificationService.listNotifications(req.user.id, { limit: 30 }),
      notificationService.unreadCount(req.user.id),
    ]);
    res.json({ notifications, unread });
  } catch (e) { next(e); }
}

export async function markRead(req, res, next) {
  try {
    await notificationService.markRead(req.user.id, req.params.id || null);
    res.json({ message: 'Marked as read.', unread: await notificationService.unreadCount(req.user.id) });
  } catch (e) { next(e); }
}

export async function markAllRead(req, res, next) {
  try {
    await notificationService.markAllRead(req.user.id);
    res.json({ message: 'All notifications marked as read.', unread: 0 });
  } catch (e) { next(e); }
}