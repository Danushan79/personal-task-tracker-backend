import { Router } from 'express';

import authRoutes from '@/routes/auth.routes';
import categoryRoutes from '@/routes/category.routes';
import dashboardRoutes from '@/routes/dashboard.routes';
import healthRoutes from '@/routes/health.routes';
import taskRoutes from '@/routes/task.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/tasks', taskRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
