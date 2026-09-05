import { z } from 'zod';

/**
 * Validates the transport shape of an id (a 24-char hex string) and nothing more.
 * Validators are transport-layer only — casting to a real `ObjectId` is Mongoose's job
 * (`ARCHITECTURE.md` Things not to do).
 */
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const isoTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm (24h)');

/** `page`/`limit` query params, coerced from strings, clamped by rejecting out-of-range. */
export function paginationSchema(defaultLimit: number, maxLimit: number) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
  });
}
