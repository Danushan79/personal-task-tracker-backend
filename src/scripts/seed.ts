import { connectDatabase, disconnectDatabase } from '@/config/db';
import { Category } from '@/models/category.model';
import { Task } from '@/models/task.model';
import { User } from '@/models/user.model';
import { DEFAULT_CATEGORIES } from '@/services/auth.service';
import { startOfDayInTz } from '@/utils/date';
import { logger } from '@/utils/logger';

/**
 * `npm run seed` (B6.4): fills a dev account with tasks spread across today / upcoming /
 * overdue, matching the dashboard mock's 12 / 28 / 3 (`DATA_MODEL.md` Seeding), so the UI
 * can be checked against the design. Day boundaries are computed in UTC — view the
 * fixture with `X-Timezone: UTC` (or no header) for the counts to land exactly on 12/28/3.
 */
const DEV_EMAIL = 'dev@example.com';
const DEV_PASSWORD = 'password123';

const PRIORITIES = ['low', 'medium', 'high'] as const;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seed(): Promise<void> {
  await connectDatabase();

  let user = await User.findOne({ email: DEV_EMAIL });
  if (!user) {
    user = await User.create({
      name: 'Dev User',
      email: DEV_EMAIL,
      passwordHash: DEV_PASSWORD,
      acceptedTermsAt: new Date(),
    });
    logger.info(`Created dev user ${DEV_EMAIL} (password: ${DEV_PASSWORD})`);
  } else {
    logger.info(`Reusing existing dev user ${DEV_EMAIL}`);
  }

  await Task.deleteMany({ userId: user._id });
  await Category.deleteMany({ userId: user._id });

  const categories = await Category.insertMany(
    DEFAULT_CATEGORIES.map((category) => ({ userId: user._id, ...category })),
  );

  function categoryIdFor(i: number) {
    const category = categories[i % categories.length];
    if (!category) throw new Error('unreachable: categories is non-empty');
    return category._id;
  }

  const now = new Date();
  const startOfToday = startOfDayInTz(now, 'UTC');

  const tasks: Array<Record<string, unknown>> = [];

  for (let i = 0; i < 12; i += 1) {
    const dueAt = new Date(startOfToday.getTime() + (8 + (i % 10)) * HOUR_MS);
    tasks.push({
      userId: user._id,
      title: `Today task ${i + 1}`,
      categoryId: categoryIdFor(i),
      dueAt,
      hasTime: true,
      originalDueAt: dueAt,
      priority: PRIORITIES[i % PRIORITIES.length],
    });
  }

  for (let i = 0; i < 28; i += 1) {
    const dueAt = new Date(startOfToday.getTime() + DAY_MS + i * DAY_MS + 9 * HOUR_MS);
    tasks.push({
      userId: user._id,
      title: `Upcoming task ${i + 1}`,
      categoryId: categoryIdFor(i),
      dueAt,
      hasTime: i % 2 === 0,
      originalDueAt: dueAt,
      priority: PRIORITIES[i % PRIORITIES.length],
    });
  }

  for (let i = 0; i < 3; i += 1) {
    const dueAt = new Date(startOfToday.getTime() - (i + 1) * DAY_MS + 9 * HOUR_MS);
    tasks.push({
      userId: user._id,
      title: `Overdue task ${i + 1}`,
      categoryId: categoryIdFor(i),
      dueAt,
      hasTime: true,
      originalDueAt: dueAt,
      priority: 'high',
    });
  }

  await Task.insertMany(tasks);

  logger.info(
    `Seeded ${categories.length} categories and ${tasks.length} tasks (12 today / 28 upcoming / 3 overdue) for ${DEV_EMAIL}`,
  );

  await disconnectDatabase();
}

seed().catch((error: unknown) => {
  logger.error('Seed failed', error);
  process.exit(1);
});
