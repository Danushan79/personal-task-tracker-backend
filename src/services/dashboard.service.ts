import { Types } from 'mongoose';

import { Task } from '@/models/task.model';
import {
  serializeTask,
  taskLikeFromAggregate,
  type RawAggregatedTask,
  type SerializedTask,
} from '@/services/task.serializer';
import { endOfDayInTz, startOfDayInTz } from '@/utils/date';

type SectionKey = 'today' | 'overdue';

const SECTION_LABELS: Record<SectionKey, string> = { today: 'Today', overdue: 'Overdue' };

interface DashboardCounts {
  today: number;
  upcoming: number;
  overdue: number;
  completedToday: number;
  noDate: number;
}

interface DashboardSection {
  key: SectionKey;
  label: string;
  total: number;
  items: SerializedTask[];
}

interface DashboardSummary {
  counts: DashboardCounts;
  sections: DashboardSection[];
  generatedAt: Date;
  timezone: string;
}

interface FacetResult {
  todayCount: Array<{ count: number }>;
  upcomingCount: Array<{ count: number }>;
  overdueCount: Array<{ count: number }>;
  completedTodayCount: Array<{ count: number }>;
  noDateCount: Array<{ count: number }>;
  todayItems: RawAggregatedTask[];
  overdueItems: RawAggregatedTask[];
}

/**
 * The whole dashboard screen behind one `$facet` aggregation (D-012, NFR-9) — five
 * independent calls could interleave with a mutation and render a count above a
 * disagreeing list. `sections` come back pre-sorted in render order (`today` before
 * `overdue`, FR-4.4) with zero-total sections omitted, so the client never re-sorts or
 * special-cases an empty list.
 */
export async function getSummary(
  userId: string,
  tz: string,
  itemsPerSection = 5,
): Promise<DashboardSummary> {
  const now = new Date();
  const uid = new Types.ObjectId(userId);
  const startOfToday = startOfDayInTz(now, tz);
  const endOfToday = endOfDayInTz(now, tz);

  const categoryLookup = [
    {
      $lookup: {
        from: 'categories',
        localField: 'categoryId',
        foreignField: '_id',
        as: 'categoryDoc',
      },
    },
    { $unwind: { path: '$categoryDoc', preserveNullAndEmptyArrays: true } },
  ];

  const [result] = await Task.aggregate<FacetResult>([
    { $match: { userId: uid } },
    {
      $facet: {
        todayCount: [
          { $match: { status: 'pending', dueAt: { $gte: startOfToday, $lte: endOfToday } } },
          { $count: 'count' },
        ],
        upcomingCount: [
          { $match: { status: 'pending', dueAt: { $gt: endOfToday } } },
          { $count: 'count' },
        ],
        overdueCount: [
          { $match: { status: 'pending', dueAt: { $lt: startOfToday, $ne: null } } },
          { $count: 'count' },
        ],
        completedTodayCount: [
          {
            $match: { status: 'completed', completedAt: { $gte: startOfToday, $lte: endOfToday } },
          },
          { $count: 'count' },
        ],
        noDateCount: [{ $match: { status: 'pending', dueAt: null } }, { $count: 'count' }],
        todayItems: [
          { $match: { status: 'pending', dueAt: { $gte: startOfToday, $lte: endOfToday } } },
          { $sort: { dueAt: 1, _id: 1 } },
          { $limit: itemsPerSection },
          ...categoryLookup,
        ],
        overdueItems: [
          { $match: { status: 'pending', dueAt: { $lt: startOfToday, $ne: null } } },
          { $sort: { dueAt: 1, _id: 1 } },
          { $limit: itemsPerSection },
          ...categoryLookup,
        ],
      },
    },
  ]);

  const counts: DashboardCounts = {
    today: result?.todayCount?.[0]?.count ?? 0,
    upcoming: result?.upcomingCount?.[0]?.count ?? 0,
    overdue: result?.overdueCount?.[0]?.count ?? 0,
    completedToday: result?.completedTodayCount?.[0]?.count ?? 0,
    noDate: result?.noDateCount?.[0]?.count ?? 0,
  };

  const sections: DashboardSection[] = (['today', 'overdue'] as const)
    .map((key) => ({
      key,
      label: SECTION_LABELS[key],
      total: key === 'today' ? counts.today : counts.overdue,
      rawItems: key === 'today' ? (result?.todayItems ?? []) : (result?.overdueItems ?? []),
    }))
    .filter((section) => section.total > 0)
    .map(({ rawItems, ...section }) => ({
      ...section,
      items: rawItems.map((raw) => serializeTask(taskLikeFromAggregate(raw), tz, now)),
    }));

  return { counts, sections, generatedAt: now, timezone: tz };
}
