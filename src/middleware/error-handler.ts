import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

import { isProduction } from '@/config/env';
import { ApiError } from '@/utils/api-error';
import { logger } from '@/utils/logger';

interface ErrorBody {
  status: 'error';
  message: string;
  details?: unknown;
  stack?: string;
}

function normalize(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.badRequest('Validation failed', error.issues);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return ApiError.badRequest('Validation failed', error.errors);
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${error.path}"`);
  }

  // e.g. an uploaded recording over the size limit — a client mistake, not a server fault.
  if (error instanceof MulterError) {
    return ApiError.badRequest(error.message);
  }

  // Duplicate key violation on a unique index.
  if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
    return ApiError.conflict('Resource already exists');
  }

  return ApiError.internal(error instanceof Error ? error.message : 'Internal server error');
}

/**
 * Terminal error middleware. Express 5 forwards rejected promises from async
 * handlers here automatically, so route handlers need no try/catch wrapper.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const apiError = normalize(error);

  if (apiError.statusCode >= 500) {
    logger.error(`[${req.id}] ${apiError.message}`, error);
  } else {
    logger.warn(`[${req.id}] ${apiError.statusCode} ${apiError.message}`);
  }

  const body: ErrorBody = {
    status: 'error',
    // Never leak internal failure detail to clients in production.
    message:
      isProduction && apiError.statusCode >= 500 ? 'Internal server error' : apiError.message,
  };

  if (apiError.details !== undefined) body.details = apiError.details;
  if (!isProduction && error instanceof Error) body.stack = error.stack;

  res.status(apiError.statusCode).json(body);
}
