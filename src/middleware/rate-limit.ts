import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';

import { isTest } from '@/config/env';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

type LimiterOverrides = Partial<Options>;

/**
 * Skips rate limiting under `NODE_ENV=test`. The integration suite legitimately calls
 * `/auth/register` far more than 10 times per run, all from the same source — without
 * this bypass the suite throttles itself. B1.6's own test builds an isolated limiter via
 * the `create*Limiter` factories below (no bypass) to verify 429 behaviour for real.
 */
function withTestBypass(overrides: LimiterOverrides = {}): LimiterOverrides {
  return { skip: () => isTest, ...overrides };
}

/** `API_CONTRACT.md` §6: login/register/forgot-password — 10 per 15 min per IP. */
export function createAuthLimiter(overrides: LimiterOverrides = {}) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    ...overrides,
  });
}

/** `API_CONTRACT.md` §6: refresh — 60 per 15 min per IP. */
export function createRefreshLimiter(overrides: LimiterOverrides = {}) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    ...overrides,
  });
}

/**
 * `API_CONTRACT.md` §6: everything else — 300 per 15 min per authenticated user. Mounted
 * after `authenticate` (B6.1), so `req.user` is set on the routes this applies to; falls
 * back to the IPv6-safe IP helper for the rare authenticated-but-unset case.
 */
export function createGlobalLimiter(overrides: LimiterOverrides = {}) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
    ...overrides,
  });
}

/**
 * Voice endpoints call a paid third-party API per request — a tighter, per-user budget
 * than the global limiter, independent of it (mounted instead of, not alongside).
 */
export function createVoiceLimiter(overrides: LimiterOverrides = {}) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
    ...overrides,
  });
}

export const authLimiter = createAuthLimiter(withTestBypass());
export const refreshLimiter = createRefreshLimiter(withTestBypass());
export const globalLimiter = createGlobalLimiter(withTestBypass());
export const voiceLimiter = createVoiceLimiter(withTestBypass());
