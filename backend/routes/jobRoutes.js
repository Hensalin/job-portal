import { Router } from 'express';
import * as c from '../controllers/jobController.js';
import { requireAuth, requireRole, requireAnyRole, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// ---- public (token optional: used only to flag saved jobs) ----
router.get('/', optionalAuth, asyncHandler(c.list));
router.get('/options', c.options);
router.get('/recommended', requireAuth, requireRole('seeker'), asyncHandler(c.recommended));
router.get('/saved', requireAuth, requireRole('seeker'), asyncHandler(c.listSaved));

// NOTE: /mine/list and /saved must come BEFORE /:id, otherwise Express matches
// "mine" as a job id and you get a confusing 404.
router.get('/mine/list', requireAuth, requireRole('employer'), asyncHandler(c.mine));

// getOneForViewer, not getOne: a signed-in visitor needs isSaved so the detail
// page's Save button shows the true state. Same response either way.
router.get('/:id', optionalAuth, asyncHandler(c.getOneForViewer));
router.get('/:id/similar', asyncHandler(c.similar));
router.get('/:id/questions', asyncHandler(c.questions));

// ---- saved jobs (seeker) ----
router.post('/:id/save', requireAuth, requireRole('seeker'), asyncHandler(c.save));
router.delete('/:id/save', requireAuth, requireRole('seeker'), asyncHandler(c.unsave));

// ---- reports (any logged-in user) ----
router.post('/:id/report', requireAuth, requireAnyRole('seeker', 'employer'), asyncHandler(c.report));

// ---- employer job management ----
router.post('/', requireAuth, requireRole('employer'), asyncHandler(c.create));
router.patch('/:id', requireAuth, requireRole('employer'), asyncHandler(c.update));
router.put('/:id', requireAuth, requireRole('employer'), asyncHandler(c.update));
router.patch('/:id/status', requireAuth, requireRole('employer'), asyncHandler(c.setStatus));
router.post('/:id/duplicate', requireAuth, requireRole('employer'), asyncHandler(c.duplicate));
router.delete('/:id', requireAuth, requireRole('employer'), asyncHandler(c.remove));

export default router;