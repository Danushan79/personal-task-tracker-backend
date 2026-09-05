import { Router } from 'express';

import {
  forgotPassword,
  getMe,
  login,
  logout,
  refresh,
  register,
  updateMe,
} from '@/controllers/auth.controller';
import { authenticate } from '@/middleware/authenticate';
import { authLimiter, globalLimiter, refreshLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  updateMeSchema,
} from '@/validators/auth.validator';

const router = Router();

// Public — `API_CONTRACT.md` lists these as the only routes exempt from Bearer auth.
router.post('/register', authLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.post('/refresh', refreshLimiter, validate({ body: refreshSchema }), refresh);
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword,
);

// Authenticated — applied per-route since this router also serves the public routes above.
// `globalLimiter` (B6.1): 300/15min per authenticated user on everything but the public
// auth routes above, which have their own tighter limiters.
router.post('/logout', authenticate, globalLimiter, validate({ body: logoutSchema }), logout);
router.get('/me', authenticate, globalLimiter, getMe);
router.patch('/me', authenticate, globalLimiter, validate({ body: updateMeSchema }), updateMe);

export default router;
