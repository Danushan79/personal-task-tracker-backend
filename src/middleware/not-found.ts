import type { Request, Response, NextFunction } from 'express';

import { ApiError } from '@/utils/api-error';

/** Catch-all for unmatched routes; hands off to the error handler. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
