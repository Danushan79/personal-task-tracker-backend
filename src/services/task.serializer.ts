import type { CategoryColor, CategoryIcon } from '@/constants/taxonomy';
import type { CategoryDocument } from '@/models/category.model';
import type { TaskDocument, TaskPriority, TaskRecurrence, TaskStatus } from '@/models/task.model';
import { calendarDaysBetween, startOfDayInTz } from '@/utils/date';

interface EmbeddedCategory {
  id: string;
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
}

/**
 * A transport-agnostic view of a task: whether it came from a hydrated Mongoose document
 * (`taskLikeFromDocument`) or a `$lookup`-joined aggregation row (`taskLikeFromAggregate`
 * — used by the list and dashboard queries, whose null-last sort and `$facet` counting
 * need aggregation rather than `.populate()`), serialisation is written once against
 * this shape.
 */
export interface TaskLike {
  id: string;
  title: string;
  description: string | null;
  category: EmbeddedCategory | null;
  dueAt: Date | null;
  hasTime: boolean;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  status: TaskStatus;
  completedAt: Date | null;
  originalDueAt: Date | null;
  rescheduleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedTask {
  id: string;
  title: string;
  description: string | null;
  category: EmbeddedCategory | null;
  dueAt: Date | null;
  hasTime: boolean;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  status: TaskStatus;
  completedAt: Date | null;
  isOverdue: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LateCompletion {
  isLate: true;
  daysLate: number;
  completedOn: string;
}

export interface SerializedTaskDetail extends SerializedTask {
  lateCompletion: LateCompletion | null;
  rescheduleCount: number;
  originalDueAt: Date | null;
}

function embedCategory(category: CategoryDocument | null): EmbeddedCategory | null {
  if (!category) return null;
  return { id: category.id, name: category.name, icon: category.icon, color: category.color };
}

/** Builds a `TaskLike` from a Task document whose `categoryId` has been `.populate()`d. */
export function taskLikeFromDocument(task: TaskDocument): TaskLike {
  const category = task.categoryId as unknown as CategoryDocument | null;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: embedCategory(category),
    dueAt: task.dueAt,
    hasTime: task.hasTime,
    priority: task.priority,
    recurrence: task.recurrence,
    status: task.status,
    completedAt: task.completedAt,
    originalDueAt: task.originalDueAt,
    rescheduleCount: task.rescheduleCount,
    createdAt: task.get('createdAt') as Date,
    updatedAt: task.get('updatedAt') as Date,
  };
}

export interface RawAggregatedTask {
  _id: unknown;
  title: string;
  description: string | null;
  categoryDoc?: { _id: unknown; name: string; icon: CategoryIcon; color: CategoryColor } | null;
  dueAt: Date | null;
  hasTime: boolean;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  status: TaskStatus;
  completedAt: Date | null;
  originalDueAt: Date | null;
  rescheduleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Builds a `TaskLike` from a `$lookup`-joined aggregation row. */
export function taskLikeFromAggregate(raw: RawAggregatedTask): TaskLike {
  const category = raw.categoryDoc ?? null;

  return {
    id: String(raw._id),
    title: raw.title,
    description: raw.description,
    category: category
      ? {
          id: String(category._id),
          name: category.name,
          icon: category.icon,
          color: category.color,
        }
      : null,
    dueAt: raw.dueAt,
    hasTime: raw.hasTime,
    priority: raw.priority,
    recurrence: raw.recurrence,
    status: raw.status,
    completedAt: raw.completedAt,
    originalDueAt: raw.originalDueAt,
    rescheduleCount: raw.rescheduleCount,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Never stored (D-005) — depends on "now" and the caller's timezone. Day-granular per
 * D-004: a task due 17:00 today is not overdue at 18:00 today, only once "today" (in
 * `tz`) has ended. A completed task is never overdue.
 */
function computeIsOverdue(task: TaskLike, tz: string, now: Date): boolean {
  if (!task.dueAt || task.status === 'completed') return false;
  return task.dueAt.getTime() < startOfDayInTz(now, tz).getTime();
}

export function serializeTask(task: TaskLike, tz: string, now: Date = new Date()): SerializedTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    dueAt: task.dueAt,
    hasTime: task.hasTime,
    priority: task.priority,
    recurrence: task.recurrence,
    status: task.status,
    completedAt: task.completedAt,
    isOverdue: computeIsOverdue(task, tz, now),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

/**
 * `null` unless the task is completed and late (gap G8). `daysLate` is whole calendar
 * days in `tz`, minimum 1 — same day-granular rule as `isOverdue` (D-004), so a same-day
 * completion is never late.
 */
function computeLateCompletion(task: TaskLike, tz: string): LateCompletion | null {
  if (task.status !== 'completed' || !task.completedAt || !task.originalDueAt) return null;

  const daysLate = calendarDaysBetween(task.originalDueAt, task.completedAt, tz);
  if (daysLate <= 0) return null;

  return { isLate: true, daysLate, completedOn: task.completedAt.toISOString().slice(0, 10) };
}

export function serializeTaskDetail(
  task: TaskLike,
  tz: string,
  now: Date = new Date(),
): SerializedTaskDetail {
  return {
    ...serializeTask(task, tz, now),
    lateCompletion: computeLateCompletion(task, tz),
    rescheduleCount: task.rescheduleCount,
    originalDueAt: task.originalDueAt,
  };
}
