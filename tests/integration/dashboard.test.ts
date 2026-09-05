import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { Task } from '@/models/task.model';
import { authFor, type AuthSession } from '../factories/user.factory';

interface SectionBody {
  key: string;
  label: string;
  total: number;
  items: Array<{ id: string }>;
}

interface SummaryBody {
  counts: { today: number; upcoming: number; overdue: number; completedToday: number; noDate: number };
  sections: SectionBody[];
  timezone: string;
}

const app = createApp();

function auth(session: AuthSession) {
  return { Authorization: `Bearer ${session.accessToken}` };
}

async function createTasks(userId: string, count: number, build: (i: number) => Record<string, unknown>): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await Task.create({ userId, title: `Task ${i}`, ...build(i) });
  }
}

describe('dashboard summary', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches the design mock fixture: 12 today / 28 upcoming / 3 overdue', async () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const session = await authFor(app);

    await createTasks(session.userId, 12, () => ({ dueAt: new Date('2026-09-03T20:00:00.000Z'), hasTime: true }));
    await createTasks(session.userId, 28, () => ({ dueAt: new Date('2026-09-10T20:00:00.000Z'), hasTime: true }));
    await createTasks(session.userId, 3, () => ({ dueAt: new Date('2026-09-01T20:00:00.000Z'), hasTime: true }));

    const res = await request(app).get('/api/v1/dashboard/summary').set(auth(session)).set('X-Timezone', 'UTC');
    expect(res.status).toBe(200);
    const body = res.body as SummaryBody;

    expect(body.counts).toMatchObject({ today: 12, upcoming: 28, overdue: 3 });
  });

  it('counts pending tasks with no due date under noDate', async () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const session = await authFor(app);

    await createTasks(session.userId, 2, () => ({ dueAt: null }));

    const res = await request(app).get('/api/v1/dashboard/summary').set(auth(session)).set('X-Timezone', 'UTC');
    expect((res.body as SummaryBody).counts.noDate).toBe(2);
  });

  it('returns sections in render order (today before overdue) and omits zero-total sections', async () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const session = await authFor(app);

    await createTasks(session.userId, 1, () => ({ dueAt: new Date('2026-09-03T20:00:00.000Z'), hasTime: true }));

    const res = await request(app).get('/api/v1/dashboard/summary').set(auth(session)).set('X-Timezone', 'UTC');
    const body = res.body as SummaryBody;

    expect(body.sections.map((s) => s.key)).toEqual(['today']);
  });

  it('includes both sections, today first, when both are non-empty', async () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const session = await authFor(app);

    await createTasks(session.userId, 1, () => ({ dueAt: new Date('2026-09-03T20:00:00.000Z'), hasTime: true }));
    await createTasks(session.userId, 1, () => ({ dueAt: new Date('2026-09-01T20:00:00.000Z'), hasTime: true }));

    const res = await request(app).get('/api/v1/dashboard/summary').set(auth(session)).set('X-Timezone', 'UTC');
    const body = res.body as SummaryBody;

    expect(body.sections.map((s) => s.key)).toEqual(['today', 'overdue']);
  });

  it('caps items at itemsPerSection but reports the real total', async () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const session = await authFor(app);

    await createTasks(session.userId, 7, () => ({ dueAt: new Date('2026-09-03T20:00:00.000Z'), hasTime: true }));

    const res = await request(app).get('/api/v1/dashboard/summary').set(auth(session)).set('X-Timezone', 'UTC');
    const body = res.body as SummaryBody;
    const today = body.sections.find((s) => s.key === 'today');

    expect(today?.total).toBe(7);
    expect(today?.items).toHaveLength(5);
  });

  it('honours a custom itemsPerSection override', async () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const session = await authFor(app);

    await createTasks(session.userId, 7, () => ({ dueAt: new Date('2026-09-03T20:00:00.000Z'), hasTime: true }));

    const res = await request(app)
      .get('/api/v1/dashboard/summary?itemsPerSection=2')
      .set(auth(session))
      .set('X-Timezone', 'UTC');
    const today = (res.body as SummaryBody).sections.find((s) => s.key === 'today');

    expect(today?.items).toHaveLength(2);
  });
});
