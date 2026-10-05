import { Router } from 'express';
import * as c from '../controllers/jobController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.get('/', c.getJobs);
router.get('/mine/list', requireAuth, requireRole('employer'), c.getMyJobs); // before /:id
router.get('/:id', c.getJobById);
router.post('/', requireAuth, requireRole('employer'), c.createJob);
router.put('/:id', requireAuth, requireRole('employer'), c.updateJob);
router.delete('/:id', requireAuth, requireRole('employer'), c.deleteJob);
export default router;
