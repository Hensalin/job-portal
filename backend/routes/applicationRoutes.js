import { Router } from 'express';
import * as c from '../controllers/applicationController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Legacy path kept working: /api/applications/job/:jobId
router.get('/job/:jobId', requireAuth, requireRole('employer'), asyncHandler(c.forJob));

// Specific routes BEFORE /:id so they are not swallowed by it.
router.get('/mine', requireAuth, requireRole('seeker'), asyncHandler(c.mine));

router.post('/', requireAuth, requireRole('seeker'), asyncHandler(c.create));

router.get('/:id', requireAuth, asyncHandler(c.getOne));
router.post('/:id/withdraw', requireAuth, requireRole('seeker'), asyncHandler(c.withdraw));
router.patch('/:id/status', requireAuth, requireRole('employer'), asyncHandler(c.setStatus));

// recruiter notes - employer only, never exposed to the candidate
router.get('/:id/notes', requireAuth, requireRole('employer'), asyncHandler(c.listNotes));
router.post('/:id/notes', requireAuth, requireRole('employer'), asyncHandler(c.addNote));

// interviews
router.post('/:id/interviews', requireAuth, requireRole('employer'), asyncHandler(c.scheduleInterview));
router.delete('/:id/interviews/:interviewId', requireAuth, requireRole('employer'), asyncHandler(c.cancelInterview));

// short-lived signed resume download for the employer
router.get('/:id/resume', requireAuth, requireRole('employer'), asyncHandler(c.resumeDownload));

export default router;