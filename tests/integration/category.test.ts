import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { Task } from '@/models/task.model';
import { makeCategory } from '../factories/category.factory';
import { authFor } from '../factories/user.factory';

interface CategoryBody {
  id: string;
  name: string;
  icon: string;
  color: string;
  taskCount: number;
}

interface CategoryListBody {
  items: CategoryBody[];
  total: number;
}

interface MessageBody {
  message: string;
}

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('categories', () => {
  it('supports the CRUD happy path', async () => {
    const session = await authFor(app);

    const createRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory());
    expect(createRes.status).toBe(201);
    const created = createRes.body as CategoryBody;
    expect(created).toMatchObject({ name: 'Study', icon: 'school', color: '#00acc1', taskCount: 0 });

    const getRes = await request(app).get(`/api/v1/categories/${created.id}`).set(auth(session.accessToken));
    expect(getRes.status).toBe(200);
    expect((getRes.body as CategoryBody).id).toBe(created.id);

    const updateRes = await request(app)
      .patch(`/api/v1/categories/${created.id}`)
      .set(auth(session.accessToken))
      .send({ name: 'Studying' });
    expect(updateRes.status).toBe(200);
    expect((updateRes.body as CategoryBody).name).toBe('Studying');

    const deleteRes = await request(app).delete(`/api/v1/categories/${created.id}`).set(auth(session.accessToken));
    expect(deleteRes.status).toBe(204);

    const afterDelete = await request(app).get(`/api/v1/categories/${created.id}`).set(auth(session.accessToken));
    expect(afterDelete.status).toBe(404);
  });

  it('starts a new user with no categories', async () => {
    const session = await authFor(app);

    const res = await request(app).get('/api/v1/categories').set(auth(session.accessToken));
    expect(res.status).toBe(200);
    expect((res.body as CategoryListBody).total).toBe(0);
  });

  it('rejects a duplicate name case-insensitively with 409', async () => {
    const session = await authFor(app);
    await request(app).post('/api/v1/categories').set(auth(session.accessToken)).send(makeCategory({ name: 'Gym' }));

    const dup = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory({ name: 'gym' }));

    expect(dup.status).toBe(409);
    expect((dup.body as MessageBody).message).toBe('A category with that name already exists');
  });

  it('rejects renaming a category to a name already used by another of the user\'s categories', async () => {
    const session = await authFor(app);
    await request(app).post('/api/v1/categories').set(auth(session.accessToken)).send(makeCategory({ name: 'Alpha' }));
    const betaRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory({ name: 'Beta' }));
    const beta = betaRes.body as CategoryBody;

    const res = await request(app)
      .patch(`/api/v1/categories/${beta.id}`)
      .set(auth(session.accessToken))
      .send({ name: 'Alpha' });

    expect(res.status).toBe(409);
  });

  it('allows two different users to both have a category named "Work"', async () => {
    const userA = await authFor(app);
    const userB = await authFor(app);

    const resA = await request(app)
      .post('/api/v1/categories')
      .set(auth(userA.accessToken))
      .send(makeCategory({ name: 'Duplicate Across Users' }));
    const resB = await request(app)
      .post('/api/v1/categories')
      .set(auth(userB.accessToken))
      .send(makeCategory({ name: 'Duplicate Across Users' }));

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });

  it('rejects an invalid icon with 400', async () => {
    const session = await authFor(app);
    const res = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory({ icon: 'not-a-real-icon' as never }));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid colour with 400', async () => {
    const session = await authFor(app);
    const res = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory({ color: '#ffffff' as never }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for another user\'s category', async () => {
    const owner = await authFor(app);
    const stranger = await authFor(app);

    const createRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(owner.accessToken))
      .send(makeCategory());
    const created = createRes.body as CategoryBody;

    const res = await request(app).get(`/api/v1/categories/${created.id}`).set(auth(stranger.accessToken));
    expect(res.status).toBe(404);
  });

  it('nulls out categoryId on tasks when deleting without reassignTo', async () => {
    const session = await authFor(app);
    const createRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory());
    const category = createRes.body as CategoryBody;

    const task = await Task.create({ userId: session.userId, title: 'A task', categoryId: category.id });

    await request(app).delete(`/api/v1/categories/${category.id}`).set(auth(session.accessToken)).expect(204);

    const reloaded = await Task.findById(task._id);
    expect(reloaded?.categoryId).toBeNull();
  });

  it('reassigns tasks to the target category when deleting with reassignTo', async () => {
    const session = await authFor(app);
    const sourceRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory({ name: 'Source' }));
    const targetRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory({ name: 'Target' }));
    const source = sourceRes.body as CategoryBody;
    const target = targetRes.body as CategoryBody;

    const task = await Task.create({ userId: session.userId, title: 'A task', categoryId: source.id });

    await request(app)
      .delete(`/api/v1/categories/${source.id}?reassignTo=${target.id}`)
      .set(auth(session.accessToken))
      .expect(204);

    const reloaded = await Task.findById(task._id);
    expect(String(reloaded?.categoryId)).toBe(target.id);
  });

  it('returns 422 when reassignTo equals the category being deleted', async () => {
    const session = await authFor(app);
    const createRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory());
    const category = createRes.body as CategoryBody;

    const res = await request(app)
      .delete(`/api/v1/categories/${category.id}?reassignTo=${category.id}`)
      .set(auth(session.accessToken));
    expect(res.status).toBe(422);
  });

  it('returns 422 when reassignTo names a category that does not exist', async () => {
    const session = await authFor(app);
    const createRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory());
    const category = createRes.body as CategoryBody;

    const res = await request(app)
      .delete(`/api/v1/categories/${category.id}?reassignTo=64f0000000000000000000aa`)
      .set(auth(session.accessToken));
    expect(res.status).toBe(422);
  });

  it('counts only pending tasks in taskCount by default', async () => {
    const session = await authFor(app);
    const createRes = await request(app)
      .post('/api/v1/categories')
      .set(auth(session.accessToken))
      .send(makeCategory());
    const category = createRes.body as CategoryBody;

    await Task.create({ userId: session.userId, title: 'Pending', categoryId: category.id, status: 'pending' });
    await Task.create({
      userId: session.userId,
      title: 'Done',
      categoryId: category.id,
      status: 'completed',
      completedAt: new Date(),
    });

    const res = await request(app).get(`/api/v1/categories/${category.id}`).set(auth(session.accessToken));
    expect((res.body as CategoryBody).taskCount).toBe(1);

    const listRes = await request(app)
      .get('/api/v1/categories?includeCompleted=true')
      .set(auth(session.accessToken));
    const found = (listRes.body as CategoryListBody).items.find((c) => c.id === category.id);
    expect(found?.taskCount).toBe(2);
  });
});
