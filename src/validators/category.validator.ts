import { z } from 'zod';

import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/constants/taxonomy';
import { objectIdSchema, paginationSchema } from '@/validators/common';

const nameSchema = z.string().trim().min(1).max(40);
const iconSchema = z.enum(CATEGORY_ICONS);
const colorSchema = z.enum(CATEGORY_COLORS);

export const listCategoriesQuerySchema = paginationSchema(100, 100).extend({
  includeCompleted: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const createCategorySchema = z.object({
  name: nameSchema,
  icon: iconSchema,
  color: colorSchema,
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const deleteCategoryQuerySchema = z.object({
  reassignTo: objectIdSchema.optional(),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryIdParams = z.infer<typeof categoryIdParamsSchema>;
export type DeleteCategoryQuery = z.infer<typeof deleteCategoryQuerySchema>;
