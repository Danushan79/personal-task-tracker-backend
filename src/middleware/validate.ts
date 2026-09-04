import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Parses `req.body` / `req.query` / `req.params` against the given schemas into
 * `req.validated`. Controllers read from there, never from `req.body`
 * (`ARCHITECTURE.md` Validation). A thrown `ZodError` is left uncaught — the
 * error handler already translates it to a 400 with `details`.
 */
export const validate =
  (schemas: ValidationSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    req.validated = {
      body: schemas.body ? schemas.body.parse(req.body) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
