import { Router } from 'express';
import * as c from '../controllers/companyController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Public company page (no token needed to browse a company).
router.get('/:id', asyncHandler(c.getPublic));

// Everything below needs a token.
router.use(requireAuth);

router.get('/mine/company', requireRole('employer'), asyncHandler(c.getMine));
router.post('/company', requireRole('employer'), asyncHandler(c.upsert));
router.put('/company', requireRole('employer'), asyncHandler(c.upsert));

// Resumes are seeker-owned, so they live on their own router (see server.js)
// but are exposed here too for convenience.

export default router;