import { describe, expect, it } from 'vitest';

import { serializeTask, serializeTaskDetail, type TaskLike } from '@/services/task.serializer';

function baseTask(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    id: 't1',
    title: 'Task',
    description: null,
    category: null,
    dueAt: null,
    hasTime: false,
    priority: 'medium',
    recurrence: 'none',
    status: 'pending',
    completedAt: null,
    originalDueAt: null,
    rescheduleCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('serializeTask isOverdue (D-004: day-granular, not minute-granular)', () => {
  it('is not overdue when due later today, even after that time has passed', () => {
    const now = new Date('2026-09-03T18:00:00.000Z');
    const task = baseTask({ dueAt: new Date('2026-09-03T17:00:00.000Z') });
    expect(serializeTask(task, 'UTC', now).isOverdue).toBe(false);
  });

  it('is overdue once the calendar day has ended', () => {
    const now = new Date('2026-09-04T00:01:00.000Z');
    const task = baseTask({ dueAt: new Date('2026-09-03T17:00:00.000Z') });
    expect(serializeTask(task, 'UTC', now).isOverdue).toBe(true);
  });

  it('a task with no due date is never overdue', () => {
    const task = baseTask({ dueAt: null });
    expect(serializeTask(task, 'UTC', new Date('2099-01-01T00:00:00.000Z')).isOverdue).toBe(false);
  });

  it('a completed task is never overdue', () => {
    const now = new Date('2026-09-10T00:00:00.000Z');
    const task = baseTask({
      dueAt: new Date('2026-01-01T00:00:00.000Z'),
      status: 'completed',
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(serializeTask(task, 'UTC', now).isOverdue).toBe(false);
  });
});

describe('serializeTaskDetail lateCompletion (gap G8)', () => {
  it('is null for a same-day completion', () => {
    const task = baseTask({
      status: 'completed',
      originalDueAt: new Date('2026-06-01T09:00:00.000Z'),
      completedAt: new Date('2026-06-01T18:00:00.000Z'),
    });
    expect(serializeTaskDetail(task, 'UTC').lateCompletion).toBeNull();
  });

  it('daysLate is 1, never 0, exactly one calendar day late', () => {
    const task = baseTask({
      status: 'completed',
      originalDueAt: new Date('2026-06-01T09:00:00.000Z'),
      completedAt: new Date('2026-06-02T09:00:00.000Z'),
    });
    expect(serializeTaskDetail(task, 'UTC').lateCompletion).toMatchObject({
      isLate: true,
      daysLate: 1,
    });
  });

  it('is null when the task is not completed', () => {
    const task = baseTask({
      status: 'pending',
      originalDueAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    expect(serializeTaskDetail(task, 'UTC').lateCompletion).toBeNull();
  });
});
