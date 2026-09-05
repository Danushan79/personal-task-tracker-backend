import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';

describe('smoke', () => {
  it('boots the app and GET /api/v1/health reports the database as connected', async () => {
    const app = createApp();

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'connected' });
  });

  it('returns the standard error envelope for an unmatched route', async () => {
    const app = createApp();

    const response = await request(app).get('/api/v1/not-a-real-route');

    expect(response.status).toBe(404);
    const body = response.body as { status: string; message: string };
    expect(body.status).toBe('error');
    expect(body.message).toEqual(expect.any(String));
  });
});
