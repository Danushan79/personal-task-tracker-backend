import { randomUUID } from 'node:crypto';

import type { Application } from 'express';
import request from 'supertest';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

/** Unique email per call — shared literal emails across tests produce spurious 409s. */
export function makeUser(overrides: Partial<RegisterPayload> = {}): RegisterPayload {
  return {
    name: 'Test User',
    email: `${randomUUID()}@example.test`,
    password: 'password123',
    acceptedTerms: true,
    ...overrides,
  };
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

interface RegisterResponseBody {
  user: { id: string };
  accessToken: string;
  refreshToken: string;
}

/** Registers a fresh user against the real app and returns a ready-to-use session. */
export async function authFor(app: Application, overrides: Partial<RegisterPayload> = {}): Promise<AuthSession> {
  const payload = makeUser(overrides);
  const response = await request(app).post('/api/v1/auth/register').send(payload);

  if (response.status !== 201) {
    throw new Error(`authFor: register failed (${response.status}): ${JSON.stringify(response.body)}`);
  }

  const body = response.body as RegisterResponseBody;

  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user.id,
    email: payload.email,
  };
}
