import { Router } from 'express';

import {
  complete,
  create,
  getById,
  list,
  remove,
  reopen,
  reschedule,
  update,
} from '@/controllers/task.controller';
import { authenticate } from '@/middleware/authenticate';
import { globalLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import {
  createTaskSchema,
  listTasksQuerySchema,
  rescheduleTaskSchema,
  taskIdParamsSchema,
  updateTaskSchema,
} from '@/validators/task.validator';

const router = Router();
router.use(authenticate);
router.use(globalLimiter);

router.get('/', validate({ query: listTasksQuerySchema }), list);
router.post('/', validate({ body: createTaskSchema }), create);
router.get('/:id', validate({ params: taskIdParamsSchema }), getById);
router.patch('/:id', validate({ params: taskIdParamsSchema, body: updateTaskSchema }), update);
router.delete('/:id', validate({ params: taskIdParamsSchema }), remove);
router.post('/:id/complete', validate({ params: taskIdParamsSchema }), complete);
router.post('/:id/reopen', validate({ params: taskIdParamsSchema }), reopen);
router.post(
  '/:id/reschedule',
  validate({ params: taskIdParamsSchema, body: rescheduleTaskSchema }),
  reschedule,
);

export default router;
