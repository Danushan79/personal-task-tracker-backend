import { Types } from 'mongoose';

import { Category } from '@/models/category.model';
import { Task, type TaskRecurrence } from '@/models/task.model';
import { nextDueAt } from '@/services/recurrence.service';
import {
  serializeTask,
  serializeTaskDetail,
  taskLikeFromAggregate,
  taskLikeFromDocument,
  type RawAggregatedTask,
  type SerializedTask,
  type SerializedTaskDetail,
} from '@/services/task.serializer';
import { ApiError } from '@/utils/api-error';
import { composeDueAt, endOfDayInTz, startOfDayInTz } from '@/utils/date';
import type {
  CreateTaskInput,
  ListTasksQuery,
  RescheduleTaskInput,
  UpdateTaskInput,
} from '@/validators/task.validator';

interface TaskListResult {
  items: SerializedTask[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export type CompleteResult =
  SerializedTaskDetail | { task: SerializedTaskDetail; nextOccurrence: SerializedTaskDetail };

async function assertCategoryOwnership(userId: string, categoryId: string): Promise<void> {
  const exists = await Category.exists({ _id: categoryId, userId });
  if (!exists) throw ApiError.notFound('Category not found');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type SortKey = ListTasksQuery['sort'] | '-completedAt';

/**
 * Tasks with no `dueAt` sort last regardless of direction (`API_CONTRACT.md` §4) — plain
 * `.sort()` can't express that (Mongo's null-ordering is direction-dependent), hence the
 * `hasDueDate` grouping key for the two `dueAt` sorts.
 */
function buildSortStage(sort: SortKey): {
  addFields?: Record<string, unknown>;
  sort: Record<string, 1 | -1>;
} {
  switch (sort) {
    case 'dueAt':
      return {
        addFields: { hasDueDate: { $cond: [{ $eq: ['$dueAt', null] }, 0, 1] } },
        sort: { hasDueDate: -1, dueAt: 1, _id: 1 },
      };
    case '-dueAt':
      return {
        addFields: { hasDueDate: { $cond: [{ $eq: ['$dueAt', null] }, 0, 1] } },
        sort: { hasDueDate: -1, dueAt: -1, _id: 1 },
      };
    case 'createdAt':
      return { sort: { createdAt: 1, _id: 1 } };
    case '-createdAt':
      return { sort: { createdAt: -1, _id: 1 } };
    case 'priority':
      return {
        addFields: {
          priorityRank: {
            $switch: {
              branches: [
                { case: { $eq: ['$priority', 'high'] }, then: 0 },
                { case: { $eq: ['$priority', 'medium'] }, then: 1 },
                { case: { $eq: ['$priority', 'low'] }, then: 2 },
              ],
              default: 3,
            },
          },
        },
        sort: { priorityRank: 1, _id: 1 },
      };
    case '-completedAt':
      return { sort: { completedAt: -1, _id: 1 } };
  }
}

export async function list(
  userId: string,
  tz: string,
  query: ListTasksQuery,
): Promise<TaskListResult> {
  const now = new Date();
  const match: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

  let status = query.status;
  let sort: SortKey = query.sort;

  if (query.bucket) {
    switch (query.bucket) {
      case 'today':
        status = 'pending';
        match.dueAt = { $gte: startOfDayInTz(now, tz), $lte: endOfDayInTz(now, tz) };
        break;
      case 'upcoming':
        status = 'pending';
        match.dueAt = { $gt: endOfDayInTz(now, tz) };
        break;
      case 'overdue':
        status = 'pending';
        match.dueAt = { $lt: startOfDayInTz(now, tz), $ne: null };
        break;
      case 'nodate':
        status = 'pending';
        match.dueAt = null;
        break;
      case 'completed':
        status = 'completed';
        sort = '-completedAt';
        break;
    }
  }

  match.status = status;

  if (query.categoryId === 'none') {
    match.categoryId = null;
  } else if (query.categoryId) {
    match.categoryId = new Types.ObjectId(query.categoryId);
  }

  if (query.priority) match.priority = query.priority;

  if (query.from ?? query.to) {
    const existing = match.dueAt && typeof match.dueAt === 'object' ? { ...match.dueAt } : {};
    match.dueAt = {
      ...existing,
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  if (query.q) {
    match.title = { $regex: escapeRegex(query.q), $options: 'i' };
  }

  const sortStage = buildSortStage(sort);

  const [result] = await Task.aggregate<{
    items: RawAggregatedTask[];
    total: Array<{ count: number }>;
  }>([
    { $match: match },
    {
      $lookup: {
        from: 'categories',
        localField: 'categoryId',
        foreignField: '_id',
        as: 'categoryDoc',
      },
    },
    { $unwind: { path: '$categoryDoc', preserveNullAndEmptyArrays: true } },
    ...(sortStage.addFields ? [{ $addFields: sortStage.addFields }] : []),
    { $sort: sortStage.sort },
    {
      $facet: {
        items: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const items = (result?.items ?? []).map((raw) =>
    serializeTask(taskLikeFromAggregate(raw), tz, now),
  );
  const total = result?.total?.[0]?.count ?? 0;

  return {
    items,
    page: query.page,
    limit: query.limit,
    total,
    hasMore: query.page * query.limit < total,
  };
}

export async function create(
  userId: string,
  tz: string,
  input: CreateTaskInput,
): Promise<SerializedTask> {
  if (input.recurrence !== 'none' && !input.dueDate) {
    throw new ApiError(422, 'A recurring task requires a due date');
  }

  if (input.categoryId) {
    await assertCategoryOwnership(userId, input.categoryId);
  }

  const { dueAt, hasTime } = composeDueAt(input.dueDate, input.dueTime, tz);

  const task = await Task.create({
    userId,
    title: input.title,
    description: input.description ?? null,
    categoryId: input.categoryId ?? null,
    dueAt,
    hasTime,
    originalDueAt: dueAt,
    priority: input.priority,
    recurrence: input.recurrence,
  });

  await task.populate('categoryId');

  return serializeTask(taskLikeFromDocument(task), tz);
}

export async function get(userId: string, tz: string, id: string): Promise<SerializedTaskDetail> {
  const task = await Task.findOne({ _id: id, userId }).populate('categoryId');
  if (!task) throw ApiError.notFound('Task not found');

  return serializeTaskDetail(taskLikeFromDocument(task), tz);
}

/**
 * PATCH moves `originalDueAt` when `dueDate` changes — an edit is a correction.
 * `reschedule` (below) does not. That distinction is the whole reason the two endpoints
 * exist (`API_CONTRACT.md` PATCH /tasks/:id).
 */
export async function update(
  userId: string,
  tz: string,
  id: string,
  input: UpdateTaskInput,
): Promise<SerializedTaskDetail> {
  const task = await Task.findOne({ _id: id, userId });
  if (!task) throw ApiError.notFound('Task not found');

  if (input.categoryId !== undefined) {
    if (input.categoryId) await assertCategoryOwnership(userId, input.categoryId);
    task.categoryId = input.categoryId ? new Types.ObjectId(input.categoryId) : null;
  }

  if (input.title !== undefined) task.title = input.title;
  if (input.description !== undefined) task.description = input.description;
  if (input.priority !== undefined) task.priority = input.priority;
  if (input.recurrence !== undefined) task.recurrence = input.recurrence;

  if (input.dueDate !== undefined) {
    if (input.dueDate === null) {
      task.dueAt = null;
      task.hasTime = false;
      task.originalDueAt = null;
      task.recurrence = 'none';
    } else {
      const { dueAt, hasTime } = composeDueAt(input.dueDate, input.dueTime, tz);
      task.dueAt = dueAt;
      task.hasTime = hasTime;
      task.originalDueAt = dueAt;
    }
  }

  if (task.recurrence !== 'none' && !task.dueAt) {
    throw new ApiError(422, 'A recurring task requires a due date');
  }

  await task.save();
  await task.populate('categoryId');

  return serializeTaskDetail(taskLikeFromDocument(task), tz);
}

export async function remove(userId: string, id: string): Promise<void> {
  const result = await Task.deleteOne({ _id: id, userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Task not found');
}

export async function reschedule(
  userId: string,
  tz: string,
  id: string,
  input: RescheduleTaskInput,
): Promise<SerializedTaskDetail> {
  const task = await Task.findOne({ _id: id, userId });
  if (!task) throw ApiError.notFound('Task not found');

  const { dueAt, hasTime } = composeDueAt(input.dueDate, input.dueTime, tz);

  if (dueAt && dueAt.getTime() < Date.now()) {
    throw new ApiError(422, 'Cannot reschedule to a date in the past');
  }

  // originalDueAt and completedAt are left untouched — a reschedule is not a correction.
  task.dueAt = dueAt;
  task.hasTime = hasTime;
  task.rescheduleCount += 1;

  await task.save();
  await task.populate('categoryId');

  return serializeTaskDetail(taskLikeFromDocument(task), tz);
}

/**
 * Idempotent. For a recurring task (D-007), materialises the next occurrence and returns
 * `{ task, nextOccurrence }`; for `recurrence: 'none'`, returns the bare task. The mobile
 * client branches on the presence of `nextOccurrence` (`API_CONTRACT.md` complete).
 */
export async function complete(userId: string, tz: string, id: string): Promise<CompleteResult> {
  const task = await Task.findOne({ _id: id, userId });
  if (!task) throw ApiError.notFound('Task not found');

  if (task.status === 'completed') {
    await task.populate('categoryId');
    return serializeTaskDetail(taskLikeFromDocument(task), tz);
  }

  const now = new Date();
  task.status = 'completed';
  task.completedAt = now;
  await task.save();

  const recurrence: TaskRecurrence = task.recurrence;
  if (recurrence === 'none') {
    await task.populate('categoryId');
    return serializeTaskDetail(taskLikeFromDocument(task), tz);
  }

  const baseDueAt = task.dueAt ?? now;
  const nextDue = nextDueAt(baseDueAt, recurrence, tz, now);

  const nextTask = await Task.create({
    userId,
    title: task.title,
    description: task.description,
    categoryId: task.categoryId,
    dueAt: nextDue,
    hasTime: task.hasTime,
    originalDueAt: nextDue,
    priority: task.priority,
    recurrence: task.recurrence,
    recurrenceParentId: task._id,
  });

  await Promise.all([task.populate('categoryId'), nextTask.populate('categoryId')]);

  return {
    task: serializeTaskDetail(taskLikeFromDocument(task), tz),
    nextOccurrence: serializeTaskDetail(taskLikeFromDocument(nextTask), tz),
  };
}

/** Idempotent. Does not delete any occurrence `complete` may have spawned. */
export async function reopen(
  userId: string,
  tz: string,
  id: string,
): Promise<SerializedTaskDetail> {
  const task = await Task.findOne({ _id: id, userId }).populate('categoryId');
  if (!task) throw ApiError.notFound('Task not found');

  if (task.status === 'pending') {
    return serializeTaskDetail(taskLikeFromDocument(task), tz);
  }

  task.status = 'pending';
  task.completedAt = null;
  await task.save();

  return serializeTaskDetail(taskLikeFromDocument(task), tz);
}
