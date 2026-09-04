import { Router } from 'express';

import healthRoutes from '@/routes/health.routes';

const router = Router();

router.use('/health', healthRoutes);

// Feature routers go here, e.g.:
// router.use('/tasks', taskRoutes);

export default router;
