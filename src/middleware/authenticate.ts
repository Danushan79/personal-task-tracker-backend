import type { NextFunction, Request, Response } from 'express';

import { verifyAccess } from '@/services/token.service';
import { ApiError } from '@/utils/api-error';

const BEARER_PREFIX = 'Bearer ';

/**
 * Bearer -> `req.user = { id: sub }`. Throws 401 on a missing, malformed, expired, or
 * wrong-secret token. Does not load the user document — a DB round-trip on every request
 * is wasted work (NFR-9); `/auth/me` loads it explicitly.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('Authorization');

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw ApiError.unauthorized();
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) throw ApiError.unauthorized();

  req.user = verifyAccess(token);
  next();
}
