import { Router } from 'express';
import * as c from '../controllers/companyController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadResumeFile } from '../middleware/upload.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(requireAuth);

// Resume upload. multipart/form-data with the field name "file".
router.get('/', requireRole('seeker'), asyncHandler(c.listResumes));
router.post('/', requireRole('seeker'), uploadResumeFile, asyncHandler(c.addResume));
router.delete('/:id', requireRole('seeker'), asyncHandler(c.deleteResume));
router.patch('/:id/default', requireRole('seeker'), asyncHandler(c.defaultResume));

export default router;