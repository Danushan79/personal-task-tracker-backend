import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { makeTask } from '../factories/task.factory';
import { authFor, type AuthSession } from '../factories/user.factory';

interface TaskBody {
  id: string;
  dueAt: string | null;
  status: string;
  completedAt: string | null;
  originalDueAt: string | null;
  rescheduleCount: number;
  recurrence: string;
  lateCompletion: { isLate: boolean; daysLate: number } | null;
}

interface CompleteBranchedBody {
  task: TaskBody;
  nextOccurrence: TaskBody;
}

const app = createApp();

function auth(session: AuthSession) {
  return { Authorization: `Bearer ${session.accessToken}` };
}

// POST /tasks responds with the list-item shape (no originalDueAt/lateCompletion), so
// lifecycle assertions that need the detail fields re-fetch via GET /tasks/:id.
async function createTask(session: AuthSession, overrides: Parameters<typeof makeTask>[0] = {}): Promise<TaskBody> {
  const res = await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask(overrides));
  const created = res.body as TaskBody;
  const detail = await request(app).get(`/api/v1/tasks/${created.id}`).set(auth(session));
  return detail.body as TaskBody;
}

// The 15-minute access token expires when a test advances the fake clock by more than
// that — refresh it so later requests in the same test authenticate against the new time.
async function refreshSession(session: AuthSession): Promise<void> {
  const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
  const body = res.body as { accessToken: string; refreshToken: string };
  session.accessToken = body.accessToken;
  session.refreshToken = body.refreshToken;
}

describe('task lifecycle', () => {
  beforeEach(() => {
    // Only fake `Date` — faking timer functions too stalls the MongoDB driver's internal
    // heartbeat/monitoring, which hangs the next query until server-selection times out.
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('PATCH moves originalDueAt; reschedule does not', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const session = await authFor(app);
    const task = await createTask(session, { dueDate: '2026-06-10' });
    const originalDueAt = task.originalDueAt;

    const patched = await request(app)
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(session))
      .send({ dueDate: '2026-06-15' });
    const patchedBody = patched.body as TaskBody;
    expect(patchedBody.originalDueAt).not.toBe(originalDueAt);
    expect(patchedBody.originalDueAt).toBe(patchedBody.dueAt);

    const rescheduled = await request(app)
      .post(`/api/v1/tasks/${task.id}/reschedule`)
      .set(auth(session))
      .send({ dueDate: '2026-06-20' });
    const rescheduledBody = rescheduled.body as TaskBody;
    expect(rescheduledBody.originalDueAt).toBe(patchedBody.originalDueAt);
    expect(rescheduledBody.rescheduleCount).toBe(1);
  });

  it('returns 422 when rescheduling into the past', async () => {
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));
    const session = await authFor(app);
    const task = await createTask(session, { dueDate: '2026-06-20' });

    const res = await request(app)
      .post(`/api/v1/tasks/${task.id}/reschedule`)
      .set(auth(session))
      .send({ dueDate: '2026-01-01' });
    expect(res.status).toBe(422);
  });

  it('complete on a non-recurring task returns the bare task', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const session = await authFor(app);
    const task = await createTask(session, { dueDate: '2026-06-01' });

    const res = await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(auth(session));
    expect(res.status).toBe(200);
    const body = res.body as TaskBody;
    expect(body.status).toBe('completed');
    expect(body).not.toHaveProperty('nextOccurrence');
  });

  it('complete on a recurring task returns { task, nextOccurrence }', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const session = await authFor(app);
    const task = await createTask(session, { dueDate: '2026-06-01', dueTime: '09:00', recurrence: 'daily' });

    const res = await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(auth(session));
    expect(res.status).toBe(200);
    const body = res.body as CompleteBranchedBody;
    expect(body.task.status).toBe('completed');
    expect(body.nextOccurrence.status).toBe('pending');
    expect(new Date(body.nextOccurrence.dueAt!).toISOString()).toBe('2026-06-02T09:00:00.000Z');
    // A fresh occurrence is never late: its originalDueAt is its own dueAt.
    expect(body.nextOccurrence.originalDueAt).toBe(body.nextOccurrence.dueAt);
  });

  it('completing a stale daily task advances straight to a future date', async () => {
    vi.setSystemTime(new Date('2026-06-25T00:00:00.000Z'));
    const session = await authFor(app);
    // Created "as of" 3 weeks ago from the recurring task's own perspective.
    const task = await createTask(session, { dueDate: '2026-06-01', dueTime: '09:00', recurrence: 'daily' });

    const res = await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(auth(session));
    const body = res.body as CompleteBranchedBody;
    expect(new Date(body.nextOccurrence.dueAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('completing a monthly task on Jan 31 clamps to Feb 28, then Mar 28', async () => {
    vi.setSystemTime(new Date('2026-01-31T00:00:00.000Z'));
    const session = await authFor(app);
    const task = await createTask(session, { dueDate: '2026-01-31', dueTime: '00:00', recurrence: 'monthly' });

    const first = await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(auth(session));
    const firstBody = first.body as CompleteBranchedBody;
    expect(new Date(firstBody.nextOccurrence.dueAt!).toISOString()).toBe('2026-02-28T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-02-28T12:00:00.000Z'));
    await refreshSession(session);
    const second = await request(app)
      .post(`/api/v1/tasks/${firstBody.nextOccurrence.id}/complete`)
      .set(auth(session));
    const secondBody = second.body as CompleteBranchedBody;
    expect(new Date(secondBody.nextOccurrence.dueAt!).toISOString()).toBe('2026-03-28T00:00:00.000Z');
  });

  it('complete is idempotent', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const session = await authFor(app);
    const task = await createTask(session, { dueDate: '2026-06-01' });

    const first = await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(auth(session));
    const second = await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(auth(session));

    expect((first.body as TaskBody).completedAt).toBe((second.body as TaskBody).completedAt);
  });

  it('reopen clears status and completedAt, and is idempotent', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const session = await authFor(app);
    const task = await createTask(session, { dueDate: '2026-06-01' });
    await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(auth(session));

    const reopened = await request(app).post(`/api/v1/tasks/${task.id}/reopen`).set(auth(session));
    expect(reopened.status).toBe(200);
    const body = reopened.body as TaskBody;
    expect(body.status).toBe('pending');
    expect(body.completedAt).toBeNull();

    const again = await request(app).post(`/api/v1/tasks/${task.id}/reopen`).set(auth(session));
    expect((again.body as TaskBody).status).toBe('pending');
  });

  it('lateCompletion.daysLate is 2 for a task completed 2 days late', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const session = await authFor(app);
    const task = await createTask(session, { dueDate: '2026-06-01' });

    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'));
    await refreshSession(session);
    await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(auth(session));

    const res = await request(app).get(`/api/v1/tasks/${task.id}`).set(auth(session));
    expect((res.body as TaskBody).lateCompletion).toMatchObject({ isLate: true, daysLate: 2 });
  });
});
