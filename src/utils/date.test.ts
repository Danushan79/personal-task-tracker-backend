import { describe, expect, it } from 'vitest';

import { addInterval, calendarDaysBetween } from '@/utils/date';

describe('calendarDaysBetween', () => {
  it('crosses a DST spring-forward boundary correctly (America/New_York)', () => {
    // Clocks jump 2am -> 3am on 2026-03-08. This UTC instant lands on Mar 9
    // under the correct post-transition EDT (-4) offset, but on Mar 8 under
    // the stale pre-transition EST (-5) offset a naive fixed-offset
    // implementation would use.
    const originalDueAt = new Date('2026-03-07T12:00:00.000Z'); // Mar 7, 07:00 EST
    const completedAt = new Date('2026-03-09T04:30:00.000Z'); // Mar 9, 00:30 EDT

    expect(calendarDaysBetween(originalDueAt, completedAt, 'America/New_York')).toBe(2);
  });

  it('resolves a half-hour offset boundary correctly (Asia/Colombo, +5:30)', () => {
    // Both instants fall on the same UTC calendar day, but +5:30 pushes the
    // second one past midnight into the next calendar day in Colombo.
    const originalDueAt = new Date('2026-09-04T18:00:00.000Z'); // Sep 4, 23:30 +05:30
    const completedAt = new Date('2026-09-04T18:45:00.000Z'); // Sep 5, 00:15 +05:30

    expect(calendarDaysBetween(originalDueAt, completedAt, 'Asia/Colombo')).toBe(1);
    expect(calendarDaysBetween(originalDueAt, completedAt, 'UTC')).toBe(0);
  });

  it('is zero for same-day completion', () => {
    const dueAt = new Date('2026-06-01T09:00:00.000Z');
    const completedAt = new Date('2026-06-01T18:00:00.000Z');

    expect(calendarDaysBetween(dueAt, completedAt, 'UTC')).toBe(0);
  });
});

describe('addInterval', () => {
  it('clamps monthly recurrence without restoring the original day-of-month (D-007)', () => {
    const jan31 = new Date('2026-01-31T00:00:00.000Z');

    const feb28 = addInterval(jan31, 'monthly', 'UTC');
    expect(feb28.toISOString()).toBe('2026-02-28T00:00:00.000Z');

    const mar28 = addInterval(feb28, 'monthly', 'UTC');
    expect(mar28.toISOString()).toBe('2026-03-28T00:00:00.000Z');
  });

  it('advances daily and weekly by fixed day counts', () => {
    const start = new Date('2026-06-01T09:00:00.000Z');

    expect(addInterval(start, 'daily', 'UTC').toISOString()).toBe('2026-06-02T09:00:00.000Z');
    expect(addInterval(start, 'weekly', 'UTC').toISOString()).toBe('2026-06-08T09:00:00.000Z');
  });

  it('keeps the same wall-clock time across a DST boundary', () => {
    // 9am America/New_York on Mar 7 (EST, UTC-5) -> 9am on Mar 8 (EDT, UTC-4)
    // once the transition has passed, even though the UTC offset shifted.
    const nineAmEst = new Date('2026-03-07T14:00:00.000Z');

    const next = addInterval(nineAmEst, 'daily', 'America/New_York');

    expect(next.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });
});
