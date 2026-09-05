import { z } from 'zod';

export const dashboardSummaryQuerySchema = z.object({
  itemsPerSection: z.coerce.number().int().min(1).max(20).default(5),
});

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;
