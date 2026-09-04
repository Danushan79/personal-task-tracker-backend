import type { NextFunction, Request, Response } from 'express';

const DEFAULT_TIMEZONE = 'UTC';

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the `X-Timezone` header into `req.timezone`, falling back to `UTC`
 * when the header is absent or not a recognised IANA name
 * (`API_CONTRACT.md` Timezone header). This is what makes "today" mean the
 * user's today (NFR-11).
 */
export function timezone(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('X-Timezone');
  req.timezone = header && isValidTimeZone(header) ? header : DEFAULT_TIMEZONE;
  next();
}
