import { Router } from 'express';
import * as c from '../controllers/adminController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Job alerts belong to any logged-in user.
router.get('/alerts', requireAuth, asyncHandler(c.listAlerts));
router.post('/alerts', requireAuth, asyncHandler(c.createAlert));
router.patch('/alerts/:id', requireAuth, asyncHandler(c.updateAlert));
router.delete('/alerts/:id', requireAuth, asyncHandler(c.deleteAlert));
router.post('/alerts/:id/run', requireAuth, asyncHandler(c.runAlert));

// ---- everything below is admin only ----
router.use(requireAuth, requireAdmin);

router.get('/stats', asyncHandler(c.stats));
router.get('/users', asyncHandler(c.users));
router.patch('/users/:id', asyncHandler(c.setUserActive));
router.get('/jobs', asyncHandler(c.jobs));
router.delete('/jobs/:id', asyncHandler(c.deleteJob));
router.get('/companies', asyncHandler(c.companies));
router.patch('/companies/:id', asyncHandler(c.setCompanyStatus));
router.get('/reports', asyncHandler(c.reports));
router.patch('/reports/:id', asyncHandler(c.resolveReport));

export default router;