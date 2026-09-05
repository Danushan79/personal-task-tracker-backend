import { addDays, addMonths, differenceInCalendarDays, format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * All timezone-aware bucketing and arithmetic goes through this module
 * (`ARCHITECTURE.md` Dates and timezones). Nothing else calls `new Date()` for
 * day boundaries — hand-rolled UTC offset maths breaks on DST and on
 * half-hour zones like `Asia/Colombo` (D-006).
 */

export type RecurrenceUnit = 'daily' | 'weekly' | 'monthly';

/** The UTC instant of 00:00:00.000 on `date`'s calendar day in `tz`. */
export function startOfDayInTz(date: Date, tz: string): Date {
  const zoned = toZonedTime(date, tz);
  const startLocal = new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, 0, 0);
  return fromZonedTime(startLocal, tz);
}

/** The UTC instant of 23:59:59.999 on `date`'s calendar day in `tz`. */
export function endOfDayInTz(date: Date, tz: string): Date {
  const zoned = toZonedTime(date, tz);
  const endLocal = new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    23,
    59,
    59,
    999,
  );
  return fromZonedTime(endLocal, tz);
}

/**
 * Whole calendar days from `from`'s day to `to`'s day, in `tz` (positive when
 * `to` is later). Used for `daysLate` (gap G8): `calendarDaysBetween(originalDueAt,
 * completedAt, tz)`.
 */
export function calendarDaysBetween(from: Date, to: Date, tz: string): number {
  const zonedFrom = toZonedTime(from, tz);
  const zonedTo = toZonedTime(to, tz);
  return differenceInCalendarDays(zonedTo, zonedFrom);
}

/**
 * Composes the client's separate `dueDate` (`YYYY-MM-DD`) and optional
 * `dueTime` (`HH:mm`) inputs into a single `dueAt` instant, per
 * `API_CONTRACT.md` §Tasks. A `dueDate` with no `dueTime` is stored at
 * 23:59:59.999 local, `hasTime: false`.
 */
export function composeDueAt(
  dueDate: string | null | undefined,
  dueTime: string | null | undefined,
  tz: string,
): { dueAt: Date | null; hasTime: boolean } {
  if (!dueDate) return { dueAt: null, hasTime: false };

  const [year, month, day] = dueDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Invalid dueDate: ${dueDate}`);
  }

  if (!dueTime) {
    const endLocal = new Date(year, month - 1, day, 23, 59, 59, 999);
    return { dueAt: fromZonedTime(endLocal, tz), hasTime: false };
  }

  const [hours, minutes] = dueTime.split(':').map(Number);
  if (hours === undefined || minutes === undefined) {
    throw new RangeError(`Invalid dueTime: ${dueTime}`);
  }

  const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return { dueAt: fromZonedTime(local, tz), hasTime: true };
}

/** Today's calendar date in `tz`, as `YYYY-MM-DD` plus its weekday name — for prompts that need to resolve relative dates ("tomorrow", "next Friday") against the user's own today. */
export function todayInTz(tz: string, now: Date = new Date()): { date: string; weekday: string } {
  const zoned = toZonedTime(now, tz);
  return { date: format(zoned, 'yyyy-MM-dd'), weekday: format(zoned, 'EEEE') };
}

/**
 * Advances `date` by one recurrence interval, in `tz`, so a daily 9am task
 * stays 9am across a DST boundary. `monthly` clamps to the last valid day of
 * the target month without restoring the original day-of-month on later
 * additions (`DATA_MODEL.md` Recurrence semantics).
 */
export function addInterval(date: Date, unit: RecurrenceUnit, tz: string): Date {
  const zoned = toZonedTime(date, tz);

  const next =
    unit === 'daily'
      ? addDays(zoned, 1)
      : unit === 'weekly'
        ? addDays(zoned, 7)
        : addMonths(zoned, 1);

  return fromZonedTime(next, tz);
}
