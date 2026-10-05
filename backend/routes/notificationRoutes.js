import { Router } from 'express';
import * as c from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(c.list));
router.patch('/read-all', asyncHandler(c.markAllRead));
router.patch('/:id/read', asyncHandler(c.markRead));

export default router;