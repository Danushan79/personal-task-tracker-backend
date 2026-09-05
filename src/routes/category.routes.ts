import { Router } from 'express';

import { create, getById, list, remove, update } from '@/controllers/category.controller';
import { authenticate } from '@/middleware/authenticate';
import { globalLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import {
  categoryIdParamsSchema,
  createCategorySchema,
  deleteCategoryQuerySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '@/validators/category.validator';

const router = Router();
router.use(authenticate);
router.use(globalLimiter);

router.get('/', validate({ query: listCategoriesQuerySchema }), list);
router.post('/', validate({ body: createCategorySchema }), create);
router.get('/:id', validate({ params: categoryIdParamsSchema }), getById);
router.patch(
  '/:id',
  validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  update,
);
router.delete(
  '/:id',
  validate({ params: categoryIdParamsSchema, query: deleteCategoryQuerySchema }),
  remove,
);

export default router;
