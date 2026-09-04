import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`. Absent on unauthenticated routes. */
      user?: { id: string };
      /** Set by `timezone` middleware from `X-Timezone`. Falls back to `UTC`. */
      timezone: string;
      /** Set by `validate`. Controllers read from here, never from `req.body`. */
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
