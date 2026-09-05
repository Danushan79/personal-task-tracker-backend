import { z } from 'zod';

export const parseTaskSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export type ParseTaskInput = z.infer<typeof parseTaskSchema>;
