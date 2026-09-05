import type { Request, Response } from 'express';

import * as dashboardService from '@/services/dashboard.service';
import type { DashboardSummaryQuery } from '@/validators/dashboard.validator';

export async function getSummary(req: Request, res: Response): Promise<void> {
  const { itemsPerSection } = req.validated.query as DashboardSummaryQuery;
  const summary = await dashboardService.getSummary(req.user!.id, req.timezone, itemsPerSection);
  res.json(summary);
}
