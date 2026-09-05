import { createHash, randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '@/config/env';
import { RefreshToken } from '@/models/refresh-token.model';
import { ApiError } from '@/utils/api-error';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

function hashJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

export function signAccess(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Bearer -> `{ id: sub }`. No DB round-trip (`ARCHITECTURE.md` Authentication) — the
 * signature alone is trusted for the 15-minute access window.
 */
export function verifyAccess(token: string): { id: string } {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw ApiError.unauthorized();
    }
    return { id: payload.sub };
  } catch {
    throw ApiError.unauthorized();
  }
}

/** Issues a refresh token and persists its hashed `jti`. Reuses `familyId` on rotation. */
export async function signRefresh(
  userId: string,
  familyId: string = randomUUID(),
): Promise<{ token: string; familyId: string }> {
  const jti = randomUUID();

  const token = jwt.sign({ sub: userId, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });

  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string' || typeof decoded.exp !== 'number') {
    throw ApiError.internal('Failed to sign refresh token');
  }

  await RefreshToken.create({
    userId,
    jtiHash: hashJti(jti),
    familyId,
    expiresAt: new Date(decoded.exp * 1000),
    revokedAt: null,
  });

  return { token, familyId };
}

function verifyRefreshJwt(token: string): { sub: string; jti: string } {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      throw ApiError.unauthorized();
    }
    return { sub: payload.sub, jti: payload.jti };
  } catch {
    throw ApiError.unauthorized();
  }
}

/**
 * Verifies and rotates a refresh token: the presented token is revoked and a new one
 * issued in the same family. Presenting an already-revoked token means reuse of a stolen
 * or replayed token — the whole family is revoked and the caller gets 401 (D-001).
 */
export async function rotate(refreshToken: string): Promise<RefreshResult> {
  const { sub, jti } = verifyRefreshJwt(refreshToken);

  const stored = await RefreshToken.findOne({ jtiHash: hashJti(jti) });
  if (!stored) throw ApiError.unauthorized();

  if (stored.revokedAt) {
    await revokeFamily(stored.familyId);
    throw ApiError.unauthorized();
  }

  stored.revokedAt = new Date();
  await stored.save();

  const accessToken = signAccess(sub);
  const next = await signRefresh(sub, stored.familyId);

  return { accessToken, refreshToken: next.token, userId: sub };
}

/** Revokes a single refresh token. Idempotent — an unknown or malformed token is a no-op. */
export async function revoke(refreshToken: string): Promise<void> {
  let jti: string;
  try {
    jti = verifyRefreshJwt(refreshToken).jti;
  } catch {
    return;
  }

  await RefreshToken.updateOne(
    { jtiHash: hashJti(jti), revokedAt: null },
    { revokedAt: new Date() },
  );
}

export async function revokeFamily(familyId: string): Promise<void> {
  await RefreshToken.updateMany({ familyId, revokedAt: null }, { revokedAt: new Date() });
}
