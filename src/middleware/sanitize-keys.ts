import type { NextFunction, Request, Response } from 'express';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripDangerousKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDangerousKeys);
  if (!isPlainObject(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) continue;
    result[key] = stripDangerousKeys(val);
  }
  return result;
}

/**
 * Strips keys starting with `$` or containing `.` from `req.body` before it reaches a
 * validator — a Mongo operator-shaped key (`{"$gt": ""}`) reaching a query filter can
 * bypass intended matching (B6.3 security review). `req.query`/`req.params` are not
 * touched: Express 5 exposes `req.query` as a read-only getter, and every query field
 * here already goes through a narrow Zod schema (objectId regex, closed enums, coerced
 * numbers) before it can reach a Mongoose filter, so there is no equivalent gap to close.
 */
export function sanitizeKeys(req: Request, _res: Response, next: NextFunction): void {
  if (isPlainObject(req.body)) {
    req.body = stripDangerousKeys(req.body);
  }
  next();
}
