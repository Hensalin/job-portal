import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Strict limits on credential endpoints to slow down brute forcing.
router.post('/register', rateLimit({ windowMs: 60_000, max: 5, key: 'register' }), c.register);
router.post('/login', rateLimit({ windowMs: 60_000, max: 10, key: 'login' }), c.login);
router.post('/resend-verification', rateLimit({ windowMs: 60_000, max: 5, key: 'resend' }), c.resendVerification);
router.get('/me', requireAuth, c.me);
router.post('/logout', requireAuth, c.logout);

export default router;