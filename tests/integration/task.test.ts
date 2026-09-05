import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { Task } from '@/models/task.model';
import { makeCategory } from '../factories/category.factory';
import { makeTask } from '../factories/task.factory';
import { authFor, type AuthSession } from '../factories/user.factory';

interface TaskBody {
  id: string;
  title: string;
  dueAt: string | null;
  isOverdue: boolean;
  category: { id: string; name: string } | null;
}

interface TaskListBody {
  items: TaskBody[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface MessageBody {
  message: string;
}

const app = createApp();

function auth(session: AuthSession) {
  return { Authorization: `Bearer ${session.accessToken}` };
}

function tz(zone: string) {
  return { 'X-Timezone': zone };
}

describe('tasks: CRUD', () => {
  it('supports the CRUD happy path', async () => {
    const session = await authFor(app);

    const createRes = await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask({ title: 'Ship it' }));
    expect(createRes.status).toBe(201);
    const created = createRes.body as TaskBody;
    expect(created.title).toBe('Ship it');

    const getRes = await request(app).get(`/api/v1/tasks/${created.id}`).set(auth(session));
    expect(getRes.status).toBe(200);
    expect((getRes.body as TaskBody).id).toBe(created.id);

    const patchRes = await request(app)
      .patch(`/api/v1/tasks/${created.id}`)
      .set(auth(session))
      .send({ title: 'Ship it now' });
    expect(patchRes.status).toBe(200);
    expect((patchRes.body as TaskBody).title).toBe('Ship it now');

    const deleteRes = await request(app).delete(`/api/v1/tasks/${created.id}`).set(auth(session));
    expect(deleteRes.status).toBe(204);

    const afterDelete = await request(app).get(`/api/v1/tasks/${created.id}`).set(auth(session));
    expect(afterDelete.status).toBe(404);
  });

  it('embeds the category on the task', async () => {
    const session = await authFor(app);
    const catRes = await request(app).post('/api/v1/categories').set(auth(session)).send(makeCategory());
    const category = catRes.body as { id: string; name: string };

    const res = await request(app)
      .post('/api/v1/tasks')
      .set(auth(session))
      .send(makeTask({ categoryId: category.id }));

    expect(res.status).toBe(201);
    expect((res.body as TaskBody).category).toMatchObject({ id: category.id, name: category.name });
  });

  it('returns 404 for a category from another user', async () => {
    const owner = await authFor(app);
    const stranger = await authFor(app);
    const catRes = await request(app).post('/api/v1/categories').set(auth(owner)).send(makeCategory());
    const category = catRes.body as { id: string };

    const res = await request(app)
      .post('/api/v1/tasks')
      .set(auth(stranger))
      .send(makeTask({ categoryId: category.id }));
    expect(res.status).toBe(404);
  });

  it('rejects a title over 200 chars with 400', async () => {
    const session = await authFor(app);
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(auth(session))
      .send(makeTask({ title: 'x'.repeat(201) }));
    expect(res.status).toBe(400);
  });

  it('returns 422 when recurrence is set without a dueDate', async () => {
    const session = await authFor(app);
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(auth(session))
      .send(makeTask({ recurrence: 'daily' }));
    expect(res.status).toBe(422);
  });

  it('returns 404 for another user\'s task', async () => {
    const owner = await authFor(app);
    const stranger = await authFor(app);
    const createRes = await request(app).post('/api/v1/tasks').set(auth(owner)).send(makeTask());
    const created = createRes.body as TaskBody;

    const res = await request(app).get(`/api/v1/tasks/${created.id}`).set(auth(stranger));
    expect(res.status).toBe(404);
  });

  it('returns 404 when PATCHing categoryId to another user\'s category', async () => {
    const owner = await authFor(app);
    const stranger = await authFor(app);
    const createRes = await request(app).post('/api/v1/tasks').set(auth(stranger)).send(makeTask());
    const task = createRes.body as TaskBody;
    const catRes = await request(app).post('/api/v1/categories').set(auth(owner)).send(makeCategory());
    const category = catRes.body as { id: string };

    const res = await request(app)
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(stranger))
      .send({ categoryId: category.id });
    expect(res.status).toBe(404);
  });

  it('returns 422 when PATCHing recurrence on a task with no due date', async () => {
    const session = await authFor(app);
    const createRes = await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask());
    const task = createRes.body as TaskBody;

    const res = await request(app).patch(`/api/v1/tasks/${task.id}`).set(auth(session)).send({ recurrence: 'daily' });
    expect(res.status).toBe(422);
  });

  it('filters by a case-insensitive title substring via q', async () => {
    const session = await authFor(app);
    await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask({ title: 'Buy groceries' }));
    await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask({ title: 'Write report' }));

    const res = await request(app).get('/api/v1/tasks?q=GROCER').set(auth(session));
    expect((res.body as TaskListBody).items.map((t) => t.title)).toEqual(['Buy groceries']);
  });

  it('clearing dueDate via PATCH forces recurrence to none', async () => {
    const session = await authFor(app);
    const createRes = await request(app)
      .post('/api/v1/tasks')
      .set(auth(session))
      .send(makeTask({ dueDate: '2099-01-01', recurrence: 'daily' }));
    const created = createRes.body as TaskBody;

    const patchRes = await request(app)
      .patch(`/api/v1/tasks/${created.id}`)
      .set(auth(session))
      .send({ dueDate: null });

    expect(patchRes.status).toBe(200);
    const body = patchRes.body as TaskBody & { recurrence: string };
    expect(body.dueAt).toBeNull();
    expect(body.recurrence).toBe('none');
  });
});

describe('tasks: filters, sort, pagination', () => {
  it('filters by categoryId=none for uncategorised tasks', async () => {
    const session = await authFor(app);
    const catRes = await request(app).post('/api/v1/categories').set(auth(session)).send(makeCategory());
    const category = catRes.body as { id: string };

    await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask({ title: 'Has category', categoryId: category.id }));
    await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask({ title: 'No category' }));

    const res = await request(app).get('/api/v1/tasks?categoryId=none').set(auth(session));
    const body = res.body as TaskListBody;
    expect(body.items.map((t) => t.title)).toEqual(['No category']);
  });

  it('paginates results', async () => {
    const session = await authFor(app);
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask({ title: `Task ${i}` }));
    }

    const page1 = await request(app).get('/api/v1/tasks?page=1&limit=2').set(auth(session));
    const body1 = page1.body as TaskListBody;
    expect(body1.items).toHaveLength(2);
    expect(body1.total).toBe(5);
    expect(body1.hasMore).toBe(true);

    const page3 = await request(app).get('/api/v1/tasks?page=3&limit=2').set(auth(session));
    const body3 = page3.body as TaskListBody;
    expect(body3.items).toHaveLength(1);
    expect(body3.hasMore).toBe(false);
  });

  it('rejects a limit over 100 with 400', async () => {
    const session = await authFor(app);
    const res = await request(app).get('/api/v1/tasks?limit=500').set(auth(session));
    expect(res.status).toBe(400);
  });

  it('sorts tasks with no due date last, in both directions', async () => {
    const session = await authFor(app);
    await request(app).post('/api/v1/tasks').set(auth(session)).send(makeTask({ title: 'No date' }));
    await request(app)
      .post('/api/v1/tasks')
      .set(auth(session))
      .send(makeTask({ title: 'Has date', dueDate: '2099-06-01' }));

    const asc = await request(app).get('/api/v1/tasks?sort=dueAt&status=pending').set(auth(session));
    expect((asc.body as TaskListBody).items.map((t) => t.title)).toEqual(['Has date', 'No date']);

    const desc = await request(app).get('/api/v1/tasks?sort=-dueAt&status=pending').set(auth(session));
    expect((desc.body as TaskListBody).items.map((t) => t.title)).toEqual(['Has date', 'No date']);
  });
});

describe('tasks: bucket boundaries', () => {
  beforeEach(() => {
    // Only fake `Date` — faking timer functions too stalls the MongoDB driver's internal
    // heartbeat/monitoring, which hangs the next query until server-selection times out.
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves today/upcoming/overdue/nodate correctly in UTC', async () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const session = await authFor(app);

    await Task.create({ userId: session.userId, title: 'Today', dueAt: new Date('2026-09-03T23:59:59.000Z'), hasTime: true });
    await Task.create({ userId: session.userId, title: 'Upcoming', dueAt: new Date('2026-09-04T00:00:01.000Z'), hasTime: true });
    await Task.create({ userId: session.userId, title: 'Overdue', dueAt: new Date('2026-09-02T23:59:59.000Z'), hasTime: true });
    await Task.create({ userId: session.userId, title: 'No date', dueAt: null });

    const today = await request(app).get('/api/v1/tasks?bucket=today').set(auth(session)).set(tz('UTC'));
    expect((today.body as TaskListBody).items.map((t) => t.title)).toEqual(['Today']);

    const upcoming = await request(app).get('/api/v1/tasks?bucket=upcoming').set(auth(session)).set(tz('UTC'));
    expect((upcoming.body as TaskListBody).items.map((t) => t.title)).toEqual(['Upcoming']);

    const overdue = await request(app).get('/api/v1/tasks?bucket=overdue').set(auth(session)).set(tz('UTC'));
    expect((overdue.body as TaskListBody).items.map((t) => t.title)).toEqual(['Overdue']);

    const nodate = await request(app).get('/api/v1/tasks?bucket=nodate').set(auth(session)).set(tz('UTC'));
    expect((nodate.body as TaskListBody).items.map((t) => t.title)).toEqual(['No date']);
  });

  it('resolves today/upcoming/overdue relative to Asia/Colombo (+5:30), independent of UTC', async () => {
    // 2026-09-03T20:00:00Z is 2026-09-04 01:30 in Colombo — "today" in Colombo is Sep 4,
    // a different calendar day than "today" in UTC (Sep 3).
    vi.setSystemTime(new Date('2026-09-03T20:00:00.000Z'));
    const session = await authFor(app);

    await Task.create({ userId: session.userId, title: 'Today Colombo', dueAt: new Date('2026-09-04T18:29:59.000Z'), hasTime: true });
    await Task.create({ userId: session.userId, title: 'Overdue Colombo', dueAt: new Date('2026-09-03T18:29:59.000Z'), hasTime: true });
    await Task.create({ userId: session.userId, title: 'Upcoming Colombo', dueAt: new Date('2026-09-04T18:30:00.000Z'), hasTime: true });

    const today = await request(app).get('/api/v1/tasks?bucket=today').set(auth(session)).set(tz('Asia/Colombo'));
    expect((today.body as TaskListBody).items.map((t) => t.title)).toEqual(['Today Colombo']);

    const overdue = await request(app).get('/api/v1/tasks?bucket=overdue').set(auth(session)).set(tz('Asia/Colombo'));
    expect((overdue.body as TaskListBody).items.map((t) => t.title)).toEqual(['Overdue Colombo']);

    const upcoming = await request(app).get('/api/v1/tasks?bucket=upcoming').set(auth(session)).set(tz('Asia/Colombo'));
    expect((upcoming.body as TaskListBody).items.map((t) => t.title)).toEqual(['Upcoming Colombo']);
  });

  it('the completed bucket sorts by -completedAt and ignores the pending default', async () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    const session = await authFor(app);

    const first = await Task.create({
      userId: session.userId,
      title: 'Completed earlier',
      status: 'completed',
      completedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const second = await Task.create({
      userId: session.userId,
      title: 'Completed later',
      status: 'completed',
      completedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    void first;
    void second;

    const res = await request(app).get('/api/v1/tasks?bucket=completed').set(auth(session)).set(tz('UTC'));
    expect((res.body as TaskListBody).items.map((t) => t.title)).toEqual(['Completed later', 'Completed earlier']);
  });
});

describe('tasks: unauthenticated access', () => {
  it('returns a message body via the shared error envelope on 404', async () => {
    const session = await authFor(app);
    const res = await request(app).get('/api/v1/tasks/64f0000000000000000000aa').set(auth(session));
    expect(res.status).toBe(404);
    expect((res.body as MessageBody).message).toEqual(expect.any(String));
  });
});
