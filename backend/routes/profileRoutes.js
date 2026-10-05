import { Router } from 'express';
import * as c from '../controllers/profileController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(c.getMe));
router.patch('/', asyncHandler(c.updateMe));

// profile/:id is PUBLIC-ish but still requires a token so we do not serve
// scraped profile data to anonymous callers.
router.get('/:id', asyncHandler(c.getPublic));

// ---- education ----
router.get('/sections/education', asyncHandler(c.education.list));
router.post('/sections/education', asyncHandler(c.education.create));
router.patch('/sections/education/:id', asyncHandler(c.education.update));
router.delete('/sections/education/:id', asyncHandler(c.education.remove));

// ---- experience ----
router.get('/sections/experience', asyncHandler(c.experience.list));
router.post('/sections/experience', asyncHandler(c.experience.create));
router.patch('/sections/experience/:id', asyncHandler(c.experience.update));
router.delete('/sections/experience/:id', asyncHandler(c.experience.remove));

// ---- certifications ----
router.get('/sections/certifications', asyncHandler(c.certifications.list));
router.post('/sections/certifications', asyncHandler(c.certifications.create));
router.patch('/sections/certifications/:id', asyncHandler(c.certifications.update));
router.delete('/sections/certifications/:id', asyncHandler(c.certifications.remove));

export default router;