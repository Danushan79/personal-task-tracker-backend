import { z } from 'zod';

import {
  isoDateSchema,
  isoTimeSchema,
  objectIdSchema,
  paginationSchema,
} from '@/validators/common';

const prioritySchema = z.enum(['low', 'medium', 'high']);
const recurrenceSchema = z.enum(['none', 'daily', 'weekly', 'monthly']);

export const taskIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const listTasksQuerySchema = paginationSchema(20, 100).extend({
  bucket: z.enum(['today', 'upcoming', 'overdue', 'completed', 'nodate']).optional(),
  status: z.enum(['pending', 'completed']).default('pending'),
  categoryId: z.union([objectIdSchema, z.literal('none')]).optional(),
  priority: prioritySchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().min(1).optional(),
  sort: z.enum(['dueAt', '-dueAt', 'createdAt', '-createdAt', 'priority']).default('dueAt'),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  categoryId: objectIdSchema.nullable().optional(),
  dueDate: isoDateSchema.optional(),
  dueTime: isoTimeSchema.optional(),
  priority: prioritySchema.default('medium'),
  recurrence: recurrenceSchema.default('none'),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  categoryId: objectIdSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  dueTime: isoTimeSchema.optional(),
  priority: prioritySchema.optional(),
  recurrence: recurrenceSchema.optional(),
});

export const rescheduleTaskSchema = z.object({
  dueDate: isoDateSchema,
  dueTime: isoTimeSchema.optional(),
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type RescheduleTaskInput = z.infer<typeof rescheduleTaskSchema>;
