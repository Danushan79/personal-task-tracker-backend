import { addInterval, type RecurrenceUnit } from '@/utils/date';

/**
 * Advances `dueAt` by one recurrence interval, then keeps advancing while the result is
 * still in the past (`DATA_MODEL.md` Recurrence semantics, point 3) — completing a task
 * that is three weeks overdue must jump straight to a future occurrence, not spawn
 * another instantly-overdue one.
 */
export function nextDueAt(
  dueAt: Date,
  recurrence: RecurrenceUnit,
  tz: string,
  now: Date = new Date(),
): Date {
  let next = addInterval(dueAt, recurrence, tz);

  while (next.getTime() <= now.getTime()) {
    next = addInterval(next, recurrence, tz);
  }

  return next;
}
