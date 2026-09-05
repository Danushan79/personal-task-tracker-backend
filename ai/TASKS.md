# Task Backlog — Backend

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` dropped

**Rules:**
1. Work top to bottom. Phases are ordered by dependency, not preference.
2. Set `[~]` the moment you start a task. Set `[x]` only when **every** acceptance
   criterion passes.
3. Each task lists `Reads:` — the only spec sections you need for it. Read those and
   nothing else. That is how a session stays cheap.
4. A task is sized to be finishable in one sitting. If one turns out not to be, split it
   in place (`B3.2` -> `B3.2a`, `B3.2b`) and record the split in `PROGRESS.md`.
5. **Never mark a phase done without running `npm run typecheck && npm run lint`.**

---

## Phase B0 — Groundwork

> Unblocks everything. Nothing else can run until B0.1 is done.

- [x] **B0.1 — Verify the MongoDB connection**
  `Reads:` `ARCHITECTURE.md` (Local database)
  **The owner supplies `MONGODB_URI` in `.env`** (`OPEN_QUESTIONS.md` Q6, resolved
  2026-09-03) — this task does not choose or install a database. Boot the server and
  confirm the connection: `npm run dev`, then
  `curl localhost:4000/api/v1/health` returns `"database": "connected"`.
  **Accept:** health returns 200 with `connected`.
  **If `.env` has no URI yet:** mark `[!]`, note it in `PROGRESS.md`, and do B0.2/B0.3
  meanwhile — they need no database.
  **Do not start using transactions** on discovering the URI points at Atlas — see D-009.

- [x] **B0.2 — Extend `env.ts` with auth and app config**
  `Reads:` `ARCHITECTURE.md` (Config)
  Add `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`,
  `BCRYPT_ROUNDS` to the Zod schema. Secrets: `min(32)`. Add a refinement asserting the
  two secrets differ. Mirror every one into `.env.example` with a comment.
  `Files:` `src/config/env.ts`, `.env.example`, `.env`
  **Accept:** booting with a short secret exits with a readable message, not a stack trace.

- [x] **B0.3 — Shared plumbing: `toJSON` plugin, taxonomy, express types, date utils**
  `Reads:` `DATA_MODEL.md` (Serialisation rule), `ARCHITECTURE.md` (Dates and timezones)
  - `src/models/plugins/to-json.ts` — `_id` -> `id`, strip `_id`/`__v`, honour a
    per-schema `private` field list
  - `src/constants/taxonomy.ts` — `CATEGORY_ICONS` (10), `CATEGORY_COLORS` (7), as
    `as const` tuples, plus their derived union types
  - `src/types/express.d.ts` — augment `Request` with `user?: { id: string }`,
    `timezone: string`, `validated: {...}`
  - `src/utils/date.ts` — the five functions in `ARCHITECTURE.md`
  - `src/middleware/validate.ts`, `src/middleware/timezone.ts`
  `Deps:` `npm i date-fns date-fns-tz`
  **Accept:** `npm run typecheck` passes; `calendarDaysBetween` has a unit test covering
  a DST boundary and `Asia/Colombo` (+5:30).

- [x] **B0.4 — Test harness**
  `Reads:` `TESTING.md`
  Vitest + supertest + `mongodb-memory-server`. Add `test`, `test:watch`, `test:coverage`
  scripts. One passing smoke test hitting `GET /api/v1/health`.
  **Accept:** `npm test` green with at least one real assertion.

---

## Phase B1 — Auth

> Serves FR-1. Every later phase needs `req.user.id`.

- [x] **B1.1 — `User` model**
  `Reads:` `DATA_MODEL.md` (users)
  Schema, unique email index, `passwordHash` with `select: false`, `pre('save')` bcrypt
  hook guarded on `isModified`, `comparePassword` method, `toJSON` plugin.
  `Deps:` `npm i bcrypt && npm i -D @types/bcrypt`
  **Accept:** a saved user's `toJSON()` has no `passwordHash` and no `__v`; `id` is a string.

- [x] **B1.2 — `RefreshToken` model + `token.service.ts`**
  `Reads:` `API_CONTRACT.md` (Token lifetimes, /auth/refresh)
  Store **hashed** `jti` (SHA-256), `userId`, `expiresAt`, `revokedAt`, `familyId`.
  TTL index on `expiresAt`. Service: `signAccess`, `signRefresh`, `verifyAccess`,
  `verifyRefresh`, `rotate`, `revoke`, `revokeFamily`.
  `Deps:` `npm i jsonwebtoken && npm i -D @types/jsonwebtoken`
  **Accept:** rotation issues a new token and revokes the old; replaying a revoked token
  revokes the family and throws 401. Test both.

- [x] **B1.3 — `authenticate` middleware**
  `Reads:` `ARCHITECTURE.md` (Authentication)
  Bearer parse -> verify -> `req.user = { id: sub }`. No DB round-trip.
  **Accept:** missing / malformed / expired / wrong-secret tokens each give 401 with the
  standard envelope.

- [x] **B1.4 — `auth.validator.ts` + `auth.service.ts`**
  `Reads:` `API_CONTRACT.md` (§2 Auth), `DATA_MODEL.md` (Seeding)
  `register` (incl. seeding the 4 default categories), `login`, `refresh`, `logout`,
  `getMe`, `updateMe`, `forgotPassword` (stub: validate, log, return).
  **Accept:** register seeds exactly 4 categories with the documented icons and colours;
  login with a wrong password and login with an unknown email return the **identical**
  401 message.

- [x] **B1.5 — Auth routes + controller, mounted**
  `Reads:` `API_CONTRACT.md` (§2, §7)
  All 8 endpoints. Mount at `/auth` in `src/routes/index.ts`.
  **Accept:** every §2 endpoint responds with its documented status and shape.

- [x] **B1.6 — Auth rate limiting**
  `Reads:` `API_CONTRACT.md` (§6)
  `express-rate-limit`. 10/15min on login+register+forgot-password, 60/15min on refresh.
  `Deps:` `npm i express-rate-limit`
  **Accept:** the 11th login attempt in a window returns 429 with `Retry-After`.

- [x] **B1.7 — Auth integration tests**
  `Reads:` `TESTING.md`
  Full happy path (register -> me -> refresh -> logout), plus: duplicate email 409,
  `acceptedTerms: false` -> 400, revoked-token reuse -> 401, unauthenticated `/auth/me`
  -> 401.
  **Accept:** all green. **Then run `npm run typecheck && npm run lint`.**

---

## Phase B2 — Categories

> Serves FR-2. Needed by B3 (a task references a category).

- [x] **B2.1 — `Category` model**
  `Reads:` `DATA_MODEL.md` (categories)
  Schema with `enum`s imported from `constants/taxonomy.ts`. Compound unique index
  `{ userId, name }` **with collation strength 2**. `{ userId, createdAt }` index.
  **Accept:** two users can both own a "Work"; the same user cannot add "work" twice.

- [x] **B2.2 — `category.validator.ts` + `category.service.ts`**
  `Reads:` `API_CONTRACT.md` (§3), `DATA_MODEL.md` (categories, Cascade behaviour)
  `list` (with computed `taskCount` of **pending** tasks), `getById`, `create`, `update`,
  `remove` (with `reassignTo` handling and the 422 cases). All scoped to `userId`.
  **Accept:** `taskCount` counts pending only; deleting with no `reassignTo` nulls the
  tasks' `categoryId`; `reassignTo` equal to the deleted id returns 422.

- [x] **B2.3 — Category routes + controller, mounted**
  `Reads:` `API_CONTRACT.md` (§3)
  `router.use(authenticate)` at the top. Five endpoints. Mount at `/categories`.
  **Accept:** all five respond per contract; another user's category id returns **404**.

- [x] **B2.4 — Category integration tests**
  `Reads:` `TESTING.md`
  CRUD happy paths, duplicate name 409, bad icon 400, bad colour 400, cross-user access
  404, both delete modes, the 422 cases.
  **Accept:** all green. **Then `npm run typecheck && npm run lint`.**

---

## Phase B3 — Tasks (core)

> Serves FR-3. The heart of the product.

- [x] **B3.1 — `Task` model**
  `Reads:` `DATA_MODEL.md` (tasks, dueAt and hasTime, Indexes)
  All fields, all three compound indexes, `toJSON` plugin. Nothing computed in the schema.
  **Accept:** all three indexes present in `Task.schema.indexes()`; every index leads with
  `userId`.

- [x] **B3.2 — `task.serializer.ts`**
  `Reads:` `API_CONTRACT.md` (GET /tasks, GET /tasks/:id), `DATA_MODEL.md` (Computed),
  `PRD.md` (gap G8)
  `serializeTask(doc, tz)` -> contract shape with embedded `category` and computed
  `isOverdue`. `serializeTaskDetail(doc, tz)` adds `lateCompletion`, `rescheduleCount`,
  `originalDueAt`.
  **Accept:** unit tests for `isOverdue` — day-granular, so a task due 17:00 today is
  **not** overdue at 18:00 today but **is** overdue tomorrow at 00:01; `lateCompletion`
  is `null` at 0 days and `daysLate` is never 0.

- [x] **B3.3 — `task.validator.ts`**
  `Reads:` `API_CONTRACT.md` (GET /tasks params, POST /tasks)
  Query schema (bucket, status, categoryId incl. the literal `'none'`, priority,
  from/to, q, sort, page, limit with coercion and defaults) and body schemas for
  create / patch / reschedule. The 422 rule "recurrence without dueDate" belongs here as
  a Zod refinement.
  **Accept:** `?limit=500` clamps or 400s per contract; `categoryId=none` parses;
  `recurrence=daily` with no `dueDate` fails validation.

- [x] **B3.4 — `task.service.ts`: list + create + get**
  `Reads:` `API_CONTRACT.md` (§4, Bucket definitions), `ARCHITECTURE.md` (Ownership, Dates)
  Bucket -> date-range translation via `utils/date.ts`. `dueAt`/`hasTime` composition via
  `composeDueAt`. `originalDueAt` set on first assignment. Category ownership validated
  on create. `null`-`dueAt` tasks sort last in both directions.
  **Accept:** each of the 5 buckets returns the right set for a fixture spanning
  yesterday / today / tomorrow / no-date, verified in `Asia/Colombo` **and** `UTC`;
  a date-only task stores 23:59:59.999 local and stays in `today` all day.

- [x] **B3.5 — `task.service.ts`: update + delete + reschedule**
  `Reads:` `API_CONTRACT.md` (PATCH, DELETE, reschedule)
  PATCH moves `originalDueAt`; reschedule does not and increments `rescheduleCount`.
  `dueDate: null` clears the date and forces `recurrence: 'none'`. Reschedule into the
  past -> 422.
  **Accept:** the PATCH-vs-reschedule difference in `originalDueAt` is covered by a test.
  This is the distinction most likely to be lost on resume — it is why the two endpoints exist.

- [x] **B3.6 — Task routes + controller, mounted**
  `Reads:` `API_CONTRACT.md` (§4, §7)
  `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id` (complete/reopen/reschedule land
  in B4). Mount at `/tasks`.
  **Accept:** all respond per contract; cross-user ids give 404.

- [x] **B3.7 — Task integration tests**
  `Reads:` `TESTING.md`
  CRUD, every bucket, pagination boundaries, sort orders, category filter incl. `none`,
  cross-user isolation, all documented 400/404/422 cases.
  **Accept:** all green. **Then `npm run typecheck && npm run lint`.**

---

## Phase B4 — Task lifecycle and recurrence

> Serves FR-3.8, FR-3.13–3.15, gap G7.

- [x] **B4.1 — `recurrence.service.ts`**
  `Reads:` `DATA_MODEL.md` (Recurrence semantics)
  `nextDueAt(dueAt, recurrence, tz)`. Monthly clamps to the last valid day. Advances
  repeatedly while the result is still in the past.
  **Accept:** unit tests for Jan 31 -> Feb 28 -> Mar 28 (**not** Mar 31); a 3-weeks-stale
  daily task advances to a future date in one call; a 9am daily task stays 9am across DST.

- [x] **B4.2 — complete / reopen**
  `Reads:` `API_CONTRACT.md` (complete, reopen), `DATA_MODEL.md` (Recurrence)
  `complete` sets status + `completedAt`, and for a recurring task inserts the next
  occurrence with `recurrenceParentId` and its own `originalDueAt`. Response shape
  **branches**: bare task when `recurrence: 'none'`, `{ task, nextOccurrence }` otherwise.
  `reopen` clears status and `completedAt` and leaves any spawned occurrence alone. Both idempotent.
  **Accept:** the branching response shape is tested both ways — the mobile client
  branches on `nextOccurrence`, so getting this wrong breaks it silently.

- [x] **B4.3 — Lifecycle routes + tests**
  `Reads:` `API_CONTRACT.md` (§4)
  `POST /:id/complete`, `/:id/reopen`, `/:id/reschedule`.
  **Accept:** completing a task due 2 days ago yields `lateCompletion.daysLate === 2` on a
  subsequent `GET /tasks/:id`; double-complete is a no-op.
  **Then `npm run typecheck && npm run lint`.**

---

## Phase B5 — Dashboard

> Serves FR-4. One endpoint, and the mobile Dashboard screen depends on its exact shape.

- [x] **B5.1 — `dashboard.service.ts`**
  `Reads:` `API_CONTRACT.md` (§5), `PRD.md` (FR-4)
  Counts for today / upcoming / overdue / completedToday / noDate, plus `sections` in
  render order (`today` then `overdue`), zero-total sections **omitted**, `items` capped
  at 5, honouring `itemsPerSection`.
  **Perf (NFR-9):** one `$facet` aggregation, not five round-trips.
  **Accept:** section order is `today` then `overdue`; an empty section is absent from the
  array rather than present with `items: []`; `total` reflects the real count when `items`
  is capped.

- [x] **B5.2 — Dashboard route + tests**
  `Reads:` `API_CONTRACT.md` (§5)
  `GET /dashboard/summary`. Mount at `/dashboard`.
  **Accept:** with a fixture of 12 today / 28 upcoming / 3 overdue, `counts` matches the
  design mock exactly. **Then `npm run typecheck && npm run lint`.**

---

## Phase B6 — Hardening

- [x] **B6.1 — Global rate limit** — 300/15min per authenticated user (`API_CONTRACT.md` §6).
- [x] **B6.2 — Request logging with a request id** — replace bare `morgan('dev')`; correlate errors.
- [x] **B6.3 — Security review** — helmet options, body-size limit, `mongoSanitize`-equivalent for `$`-prefixed keys, `trust proxy` correctness. Confirm no route is unauthenticated by omission.
- [x] **B6.4 — `npm run seed`** — dev fixture matching the design's 12/28/3 (`DATA_MODEL.md`, Seeding).
- [x] **B6.5 — Coverage pass** — every service function has at least one test; every documented status code appears in at least one assertion.
- [x] **B6.6 — Update the repo `README.md`** — full endpoint table, auth flow, seed instructions.

---

## Phase B7 — Deferred (do not start before the owner confirms)

- [ ] **B7.1 — Real forgot-password** — needs an email provider decision (`OPEN_QUESTIONS.md` Q4).
- [ ] **B7.2 — Avatar upload** — needs a storage decision (Q5). `avatarUrl` accepts a URL in the meantime.
- [ ] **B7.3 — Push notifications / reminders** — out of v1 scope (`PRD.md` §5).
- [-] **B7.4 — Server-side speech-to-text** — **DROPPED 2026-09-03.** The owner implements
  transcription separately, outside both repos (`OPEN_QUESTIONS.md` Q1, D-013). The backend
  does no voice work. Should their implementation later need a server-side proxy — say, to
  keep an API key off the device — that is a **new** decision and a contract change, not a
  revival of this task.

---

## Traceability check

Run this before declaring v1 done. Every FR must map to a shipped task.

| Requirement | Task(s) |
| ----------- | ------- |
| FR-1.1–1.4, 1.6–1.7 | B1.4, B1.5 |
| FR-1.5 (stub) | B1.4 |
| FR-1.8 | B1.4 (`avatarUrl` on the user) |
| FR-2.1–2.3, 2.9 | B2.1, B2.2 |
| FR-2.4 | B2.2 (`taskCount`) |
| FR-2.5 | B2.3 |
| FR-2.6 | B3.4 (`categoryId` filter) |
| FR-2.7 | B2.2 (`reassignTo`) |
| FR-2.8 | B3.1 (nullable `categoryId`) |
| FR-3.1–3.7 | B3.1, B3.3, B3.4 |
| FR-3.8, 3.14 | B4.2 |
| FR-3.9, 3.16, 3.17 | client-side; server supplies `isOverdue`, `dueAt`, `hasTime` (B3.2) |
| FR-3.10 | B3.5 |
| FR-3.11 | B3.6 |
| FR-3.12 | B4.3 |
| FR-3.13 | B4.2 |
| FR-3.15 | B3.2, B4.3 (`lateCompletion`) |
| FR-4.1–4.4, 4.6 | B5.1 |
| FR-4.5 | client-side |
| FR-5.x | client-side only (mobile phase M9). No backend work — D-013. |
| FR-6.x | client-side |
| NFR-8 | B1.1, B1.2, B6.3 |
| NFR-9 | B3.1 (indexes), B5.1 (`$facet`) |
| NFR-11 | B0.3, B3.4 |
| Gaps G1, G2, G6, G7, G8, G12 | B3.3/B3.4, B3.1, B4.3, B4.1/B4.2, B3.2, B3.2 |
