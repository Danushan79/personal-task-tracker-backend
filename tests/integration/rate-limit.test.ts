import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createAuthLimiter } from '@/middleware/rate-limit';

/**
 * The app-wide `authLimiter`/`refreshLimiter`/`globalLimiter` singletons skip enforcement
 * under `NODE_ENV=test` (see `rate-limit.ts`) so the rest of the suite isn't throttled by
 * its own traffic. This test builds an isolated instance via the `create*Limiter` factory,
 * with no test bypass, to verify the real 429 + `Retry-After` behaviour (B1.6).
 */
describe('rate limiting', () => {
  it('returns 429 with Retry-After after exceeding the limit', async () => {
    const app = express();
    app.use(createAuthLimiter({ limit: 10 }));
    app.get('/', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 10; i += 1) {
      await request(app).get('/').expect(200);
    }

    const res = await request(app).get('/');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});
