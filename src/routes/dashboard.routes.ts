import { Router } from 'express';

import { getSummary } from '@/controllers/dashboard.controller';
import { authenticate } from '@/middleware/authenticate';
import { globalLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import { dashboardSummaryQuerySchema } from '@/validators/dashboard.validator';

const router = Router();
router.use(authenticate);
router.use(globalLimiter);

router.get('/summary', validate({ query: dashboardSummaryQuerySchema }), getSummary);

export default router;
