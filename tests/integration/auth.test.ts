import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { authFor, makeUser } from '../factories/user.factory';

interface AuthResponseBody {
  user: { id: string; name: string; email: string; avatarUrl: string | null; passwordHash?: string };
  accessToken: string;
  refreshToken: string;
  passwordHash?: string;
}

interface MeResponseBody {
  email: string;
  timezone: string;
  name: string;
  passwordHash?: string;
}

interface MessageResponseBody {
  message: string;
}

interface RefreshResponseBody {
  accessToken: string;
  refreshToken: string;
}

interface CategoryListResponseBody {
  items: Array<{ name: string }>;
}

const app = createApp();

describe('auth', () => {
  it('supports the full happy path: register -> me -> refresh -> logout', async () => {
    const payload = makeUser();

    const registerRes = await request(app).post('/api/v1/auth/register').send(payload);
    expect(registerRes.status).toBe(201);
    const registerBody = registerRes.body as AuthResponseBody;

    expect(registerBody.user).toMatchObject({
      name: payload.name,
      email: payload.email,
      avatarUrl: null,
    });
    expect(registerBody.user.passwordHash).toBeUndefined();
    expect(registerBody.passwordHash).toBeUndefined();

    const { accessToken, refreshToken } = registerBody;

    const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    const meBody = meRes.body as MeResponseBody;
    expect(meBody).toMatchObject({ email: payload.email, timezone: 'UTC' });
    expect(meBody.passwordHash).toBeUndefined();

    const refreshRes = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    const refreshBody = refreshRes.body as RefreshResponseBody;
    expect(refreshBody.accessToken).toEqual(expect.any(String));
    expect(refreshBody.refreshToken).toEqual(expect.any(String));
    expect(refreshBody.refreshToken).not.toBe(refreshToken);

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: refreshBody.refreshToken });
    expect(logoutRes.status).toBe(204);
  });

  it('rejects a duplicate email with 409', async () => {
    const payload = makeUser();
    await request(app).post('/api/v1/auth/register').send(payload).expect(201);

    const second = await request(app).post('/api/v1/auth/register').send(payload);
    expect(second.status).toBe(409);
    expect((second.body as MessageResponseBody).message).toBe('Email already registered');
  });

  it('rejects acceptedTerms: false with 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(makeUser({ acceptedTerms: false }));
    expect(res.status).toBe(400);
  });

  it('logs in successfully with the correct credentials', async () => {
    const payload = makeUser();
    await request(app).post('/api/v1/auth/register').send(payload).expect(201);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password });

    expect(res.status).toBe(200);
    const body = res.body as AuthResponseBody;
    expect(body.user).toMatchObject({ email: payload.email });
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
  });

  it('gives identical status and message for a wrong password and an unknown email', async () => {
    const payload = makeUser();
    await request(app).post('/api/v1/auth/register').send(payload).expect(201);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `nobody-${Date.now()}@example.test`, password: payload.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((wrongPassword.body as MessageResponseBody).message).toBe(
      (unknownEmail.body as MessageResponseBody).message,
    );
  });

  it('returns 401 for an unauthenticated GET /auth/me', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('detects refresh-token reuse and revokes the family', async () => {
    const session = await authFor(app);

    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(rotated.status).toBe(200);
    const rotatedBody = rotated.body as RefreshResponseBody;

    // Replaying the now-revoked original token must be rejected...
    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(replay.status).toBe(401);

    // ...and reuse revokes the whole family, so even the freshly-rotated token is dead.
    const afterReuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedBody.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('logout is idempotent for an unknown refresh token', async () => {
    const session = await authFor(app);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ refreshToken: 'not-a-real-token' });

    expect(res.status).toBe(204);
  });

  it('updates the profile via PATCH /auth/me', async () => {
    const session = await authFor(app);

    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'Updated Name', timezone: 'Asia/Colombo' });

    expect(res.status).toBe(200);
    expect(res.body as MeResponseBody).toMatchObject({ name: 'Updated Name', timezone: 'Asia/Colombo' });
  });

  it('always returns 202 for forgot-password, regardless of whether the account exists', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: `nobody-${Date.now()}@example.test` });

    expect(res.status).toBe(202);
    expect((res.body as MessageResponseBody).message).toEqual(expect.any(String));
  });

  it('seeds exactly the 4 default categories on register', async () => {
    const session = await authFor(app);

    const res = await request(app)
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as CategoryListResponseBody;
    expect(body.items).toHaveLength(4);
    expect(body.items.map((c) => c.name).sort()).toEqual(['Errands', 'Health', 'Personal', 'Work'].sort());
  });
});
