import { Router } from 'express';
import * as c from '../controllers/applicationController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.post('/', requireAuth, requireRole('seeker'), c.apply);
router.get('/mine', requireAuth, requireRole('seeker'), c.myApplications);
router.get('/job/:jobId', requireAuth, requireRole('employer'), c.jobApplications);
router.patch('/:id/status', requireAuth, requireRole('employer'), c.updateStatus);
export default router;
