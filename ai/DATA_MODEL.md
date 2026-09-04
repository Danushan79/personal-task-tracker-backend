# Data Model — MongoDB / Mongoose

Three collections: `users`, `categories`, `tasks`, plus `refreshtokens` for session
management. Read this before any task that touches `src/models/`.

**Serialisation rule, applied to every schema:** a `toJSON` transform maps `_id` to `id`
and strips `_id`, `__v`, and every secret field. The API contract never exposes `_id`.
Implement it once in `src/models/plugins/to-json.ts` and apply it to all schemas — not
per-schema, or one will be forgotten and leak a `passwordHash`.

---

## `users`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `_id` | ObjectId | |
| `name` | String | required, trim, 1–80 (FR-1.1) |
| `email` | String | required, unique, lowercase, trim, indexed |
| `passwordHash` | String | required, **`select: false`** |
| `avatarUrl` | String \| null | default `null` (FR-1.8) |
| `timezone` | String | IANA name, default `'UTC'` (NFR-11) |
| `acceptedTermsAt` | Date \| null | set at register when `acceptedTerms: true` (FR-1.4) |
| `createdAt` / `updatedAt` | Date | `timestamps: true` |

**Indexes:** `{ email: 1 }` unique.

`passwordHash` is `select: false` so it is excluded from every query by default. Login is
the only place that opts in, via `.select('+passwordHash')`. A missing `select: false` is
how password hashes end up in API responses.

Hashing lives in a `pre('save')` hook that only runs when the field is modified, so a
profile update never re-hashes. bcrypt cost 12 (NFR-8).

`toJSON` drops `passwordHash` as a second line of defence.

---

## `categories`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `_id` | ObjectId | |
| `userId` | ObjectId ref `User` | required, indexed |
| `name` | String | required, trim, 1–40 |
| `icon` | String | required, `enum` of the 10 allowed values |
| `color` | String | required, `enum` of the 7 allowed hex values |
| `createdAt` / `updatedAt` | Date | |

**Indexes:**
- `{ userId: 1, name: 1 }` **unique** — enforces FR-2.9 per user, not globally.
- `{ userId: 1, createdAt: 1 }` — list order.

The unique index is compound on `userId`. A plain unique index on `name` would stop two
different users both having a "Work" category.

Case-insensitivity (FR-2.9) needs a **collation** on the index:
`{ collation: { locale: 'en', strength: 2 } }`, otherwise "work" and "Work" both insert.
Queries against that index must pass the same collation.

`taskCount` is **not stored.** It is computed per request by an aggregation
`$lookup` (or one grouped `countDocuments` over the user's pending tasks). A stored
counter needs updating on create, delete, complete, reopen, category change, and cascade
delete — six places to drift out of sync, for a number the design shows on one screen.

The 10 icons and 7 colours are declared **once** in `src/constants/taxonomy.ts` and
imported by both the schema `enum` and the Zod validator, so they cannot disagree.

---

## `tasks`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `_id` | ObjectId | |
| `userId` | ObjectId ref `User` | required, indexed |
| `title` | String | required, trim, 1–200 (FR-3.1) |
| `description` | String \| null | default `null`, max 2000 (FR-3.2) |
| `categoryId` | ObjectId ref `Category` \| null | default `null` (FR-2.8) |
| `dueAt` | Date \| null | default `null`. Single UTC instant. |
| `hasTime` | Boolean | default `false`. See below. |
| `originalDueAt` | Date \| null | set on first `dueAt` assignment; preserved across reschedules |
| `priority` | String | `enum: ['low','medium','high']`, default `'medium'` (gap G2) |
| `recurrence` | String | `enum: ['none','daily','weekly','monthly']`, default `'none'` (FR-3.6) |
| `status` | String | `enum: ['pending','completed']`, default `'pending'` (FR-3.8) |
| `completedAt` | Date \| null | default `null` (FR-3.14) |
| `rescheduleCount` | Number | default `0` (FR-3.12) |
| `recurrenceParentId` | ObjectId ref `Task` \| null | links a spawned occurrence to its origin (gap G7) |
| `createdAt` / `updatedAt` | Date | |

### `dueAt` and `hasTime`

FR-3.5 designs date and time as two independent optional inputs, which yields three
distinct states the model must keep apart:

| User input | `dueAt` | `hasTime` | Client renders |
| ---------- | ------- | --------- | -------------- |
| nothing | `null` | `false` | no due date; task lands in the `nodate` bucket |
| date only | that date at **23:59:59.999 local**, converted to UTC | `false` | "Sep 5" |
| date + time | that instant, converted to UTC | `true` | "Sep 5, 10:00 AM" |

Storing a date-only task at end-of-day local rather than midnight matters: midnight would
make a task "due today" already overdue for the entire day. End-of-day means a date-only
task stays in `today` until the day actually ends.

Time is **never** stored separately from date. One instant plus one boolean cannot
disagree with itself; a `dueDate` string plus a `dueTime` string can, and will.

### Computed, never stored

| Field | Why not stored |
| ----- | -------------- |
| `isOverdue` | Depends on "now" and the caller's timezone. A stored boolean is wrong within hours and would need a cron to maintain. |
| `lateCompletion` | Derived from `completedAt` vs `originalDueAt` in the caller's timezone. |
| `taskCount` (on category) | See above. |

These belong in `src/services/task.serializer.ts`, applied on the way out. Not in the
schema, not in `toJSON` — `toJSON` has no access to the request's timezone.

### Indexes

The dashboard and the Tasks screen are the only hot paths, and both filter on
`userId` + `status` + `dueAt`:

```
{ userId: 1, status: 1, dueAt: 1 }     // buckets: today / upcoming / overdue, and sort
{ userId: 1, status: 1, completedAt: -1 }  // the completed bucket
{ userId: 1, categoryId: 1, status: 1 }    // FR-2.6 category filter, and taskCount
```

Every index leads with `userId`. Every query filters on `userId` first (see the ownership
rule in `API_CONTRACT.md`), so a non-leading `userId` would make the index unusable and
force a collection scan (NFR-9).

`{ userId: 1, recurrenceParentId: 1 }` is only worth adding if occurrence history is ever
surfaced in the UI. It is not, in v1.

---

## Recurrence semantics (gap G7)

The designs offer Daily / Weekly / Monthly but never show what completing a repeating task
does. The chosen model is **materialised occurrences**, not a virtual RRULE expansion:

1. Completing a task with `recurrence !== 'none'`:
   - the current document is completed normally (`status`, `completedAt`, `lateCompletion`)
   - a **new** task document is inserted, copying `title`, `description`, `categoryId`,
     `priority`, `recurrence`, and `hasTime`
   - the new `dueAt` is the old `dueAt` advanced by one interval
   - the new task's `originalDueAt` equals its own `dueAt` — a fresh occurrence is not late
   - `recurrenceParentId` points at the completed document
   - the new task is returned as `nextOccurrence` in the response

2. Advancing `dueAt`:
   - `daily` — +1 day
   - `weekly` — +7 days
   - `monthly` — +1 calendar month, **clamped to the last day of the shorter month**.
     Jan 31 monthly becomes Feb 28 (or 29), then Mar 28 — *not* Mar 31. Clamping without
     restoring is the standard, predictable behaviour and avoids storing an "intended day
     of month".
   - Arithmetic happens **in the user's timezone**, then converts back to UTC, so a
     daily 9am task stays 9am across a DST boundary.

3. If the advanced `dueAt` is still in the past (a task completed weeks late), advance
   **repeatedly** until it is in the future. Otherwise completing one stale daily task
   spawns another instantly-overdue task, and the user has to tap through weeks of them.

4. Editing `recurrence` on a task affects **only that document**. There is no series-wide
   edit — nothing in the designs offers "edit all occurrences", and it is the single
   biggest source of complexity in calendar products.

Why materialised: each occurrence gets a real id, so it can be individually completed,
rescheduled, or deleted — which the detail screen (FR-3.10–3.13) requires. Virtual
expansion has no id to act on.

Cost: one extra insert per completion, and completed history grows. Acceptable for a
single-user tracker.

---

## Cascade behaviour

| Action | Effect |
| ------ | ------ |
| Delete category (no `reassignTo`) | `tasks.updateMany({ categoryId }, { categoryId: null })` |
| Delete category (`reassignTo=X`) | `tasks.updateMany({ categoryId }, { categoryId: X })` |
| Delete task | Hard delete. `recurrenceParentId` references may dangle — tolerated, nothing reads them in v1. |
| Delete user | Not exposed in v1. |

Cascades run in the **service layer, not a Mongoose middleware hook.** `updateMany` and
`deleteMany` hooks do not fire document middleware, so a `pre('remove')` hook would
silently not run for bulk paths. Explicit service code is visible and testable.

Category deletion is two writes with no transaction. On a standalone MongoDB (the
`.env.example` default) transactions are unavailable — they need a replica set. The
reassign write runs **before** the delete, so the worst interleaving leaves tasks
reassigned with the old category still present: recoverable and visible, rather than
tasks pointing at a category that no longer exists.

---

## Seeding

`POST /auth/register` seeds four categories — Work, Personal, Health, Errands — with the
icons and colours listed in `API_CONTRACT.md`. Without them the Create Task pill row
(FR-3.3) is empty on first run, and the first thing a new user meets is a dead end.

A separate `npm run seed` script (task B6.4) fills a dev account with tasks spread across
today / upcoming / overdue, matching the dashboard mock's 12 / 28 / 3 so the UI can be
checked against the design.
