# Testing Strategy — Backend

Read this for any task whose acceptance criteria mention a test.

**Stack:** Vitest + Supertest + `mongodb-memory-server`.
Set up in task B0.4. Nothing here applies before that.

```bash
npm i -D vitest supertest @types/supertest mongodb-memory-server
```

---

## Why this stack

- **Vitest** — no separate transform config for TypeScript, and the ESM/`@/*` alias
  resolution matches what `tsx` already does in dev.
- **mongodb-memory-server** — a real MongoDB, in-process, per test run. Mocking Mongoose
  would test the mock; this tests the queries, the indexes, and the unique constraints,
  which is precisely where the bugs live. It also means tests run before Q6 (which
  MongoDB to develop against) is answered.
- **Supertest** — drives the real Express app through `createApp()`, so middleware
  ordering, validation, and the error handler are all in the path.

---

## The three layers

| Layer | What | Where | How much |
| ----- | ---- | ----- | -------- |
| **Unit** | Pure functions: date maths, recurrence arithmetic, serializers | `src/**/*.test.ts` beside the source | Exhaustive on edge cases |
| **Integration** | HTTP in, HTTP out, against a real in-memory DB | `tests/integration/*.test.ts` | One per endpoint, plus every documented error code |
| **Smoke** | The app boots and `/health` answers | `tests/smoke.test.ts` | One |

No mocked Mongoose, ever. A test that mocks the database cannot catch a missing `userId`
filter — which is the most dangerous class of bug in this codebase.

---

## Setup shape

```ts
// tests/setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

// Wipe between tests, don't recreate the server — recreating costs seconds per test.
afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
```

Set `NODE_ENV=test` for the test run — `src/app.ts` already checks `isTest` to silence
morgan.

**Index caveat:** `deleteMany` keeps indexes, which is what you want, but Mongoose builds
indexes asynchronously. Any test asserting a duplicate-key 409 must `await
Model.init()` first, or the unique index may not exist yet and the insert will succeed.
This is the most common flaky-test cause here.

---

## Fixtures

Put builders in `tests/factories/`, not inline literals:

```ts
export const makeUser = (over = {}) => ({ name: 'Test', email: `${randomUUID()}@t.co`, password: 'password123', acceptedTerms: true, ...over });
export const makeTask = (over = {}) => ({ title: 'A task', ...over });
export const authFor = async (app, user = makeUser()) => { /* register -> return { token, userId } */ };
```

Unique emails per call. Shared literal emails across tests produce duplicate-key failures
that look like logic bugs.

**Time:** never use the real clock for bucket tests. Fix it — `vi.setSystemTime(new
Date('2026-09-03T12:00:00Z'))` — otherwise the suite fails at midnight, or on the last day
of a month, and only sometimes.

---

## What must be tested

These are the places where a regression is silent and expensive.

### Non-negotiable

| Area | Test |
| ---- | ---- |
| **Cross-user isolation** | For **every** `:id` route: user A's id, called as user B, returns **404**. Skipping one is a data breach. |
| **Bucket boundaries** | A task due 23:59:59 today is `today`; 00:00:00 tomorrow is `upcoming`. Verified in `Asia/Colombo` (+5:30) **and** `UTC`. |
| **`isOverdue` day-granularity** | Due 17:00 today, checked 18:00 today -> `false`. Checked 00:01 tomorrow -> `true`. (D-004) |
| **`daysLate` is never 0** | Completed the same day -> `lateCompletion: null`. One calendar day later -> `daysLate: 1`. (gap G8) |
| **PATCH vs reschedule** | PATCH `dueDate` **moves** `originalDueAt`; reschedule **does not** and bumps `rescheduleCount`. This is the distinction most likely to be lost on resume. |
| **Complete's branching response** | `recurrence: none` -> bare task. Otherwise -> `{ task, nextOccurrence }`. The mobile client branches on this. |
| **Monthly clamping** | Jan 31 -> Feb 28 -> **Mar 28**, not Mar 31. (D-007) |
| **Stale recurrence** | A daily task 3 weeks overdue advances to a **future** date in one completion, not to tomorrow-of-three-weeks-ago. |
| **Password never serialised** | `toJSON()` on a user has no `passwordHash`; `GET /auth/me` response has no `passwordHash`. |
| **Login does not enumerate** | Wrong password and unknown email return the **identical** status and message. |
| **Refresh reuse detection** | Replaying a rotated token revokes the family and returns 401. |
| **Category delete modes** | No `reassignTo` -> tasks' `categoryId` becomes `null`. With it -> tasks move. `reassignTo === :id` -> 422. |
| **Case-insensitive category uniqueness** | "work" after "Work" -> 409, for the same user. Two different users can both have "Work". |
| **Dashboard section order** | `today` before `overdue`; a zero-total section is **absent**, not present with `items: []`. |

### Every documented status code

`API_CONTRACT.md` lists the codes each endpoint can return. Each one needs at least one
assertion somewhere. Task B6.5 is the audit pass for this.

---

## What not to test

- Express, Mongoose, Zod, or bcrypt internals — they have their own suites.
- Getters and setters with no logic.
- Exact error message wording, except where the contract makes it behavioural (the login
  message, which must be identical across both failure modes).
- 100% coverage as a target. Coverage is a hint about where you haven't looked, not a goal.
  Aim to cover every service function and every documented status code, and let the number
  land where it lands.

---

## Running

| Command | When |
| ------- | ---- |
| `npm test` | Before every commit |
| `npm run test:watch` | While writing a feature |
| `npm run test:coverage` | End of a phase |

A task is not `[x]` until its tests pass **and** `npm run typecheck && npm run lint` pass.
