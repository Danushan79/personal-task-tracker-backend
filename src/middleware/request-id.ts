import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

/** Stamps every request with an id so log lines (and error responses) can be correlated. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
