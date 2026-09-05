# Architecture and Conventions — Backend

Read this once before writing your first file in a session. It exists so you never have to
re-derive the layering by reading the codebase.

**Stack:** Node >= 20, Express 5, TypeScript 6 (strict), Mongoose 9, Zod 4.
**Entry:** `src/server.ts` -> `src/app.ts` -> `src/routes/index.ts`.
**Path alias:** `@/*` -> `src/*`. Resolved by `tsx` in dev, rewritten by `tsc-alias` at build.

---

## Layering

```
route  ->  validate  ->  controller  ->  service  ->  model
```

| Layer | Directory | Responsibility | Must NOT |
| ----- | --------- | -------------- | -------- |
| **Route** | `src/routes/` | Path + method + middleware chain only | contain logic |
| **Validator** | `src/validators/` | Zod schemas for body / query / params | touch the database |
| **Controller** | `src/controllers/` | Read validated input, call one service, send the response | contain business rules or build queries |
| **Service** | `src/services/` | All business logic, all Mongoose queries, all cascades | know about `req` or `res` |
| **Model** | `src/models/` | Schema, indexes, hooks, `toJSON` | contain request-shaped logic |
| **Serializer** | `src/services/*.serializer.ts` | Add computed fields (`isOverdue`, `lateCompletion`) on the way out | mutate documents |

The rule that keeps this honest: **a service function never receives `req` or `res`.** It
takes `(userId, input)` and returns data or throws `ApiError`. That makes every service
directly unit-testable and stops request handling leaking into business rules.

### Adding a feature — the standard six files

For a feature `widget`:

```
src/models/widget.model.ts          schema + indexes
src/validators/widget.validator.ts  Zod schemas
src/services/widget.service.ts      logic
src/controllers/widget.controller.ts thin handlers
src/routes/widget.routes.ts         router
src/routes/index.ts                 mount it  (edit, don't create)
```

`src/routes/index.ts` already has the marker comment showing where feature routers mount.

---

## Target folder layout

Existing files are marked; the rest is what the phases in `TASKS.md` add.

```
src/
├── app.ts                          [exists] middleware + route mounting
├── server.ts                       [exists] boot, DB connect, graceful shutdown
├── config/
│   ├── env.ts                      [exists] Zod-validated env — extend for JWT secrets
│   └── db.ts                       [exists] Mongoose lifecycle
├── constants/
│   └── taxonomy.ts                 the 10 icons + 7 colours, single source of truth
├── models/
│   ├── plugins/to-json.ts          _id -> id, strip __v and secrets
│   ├── user.model.ts
│   ├── category.model.ts
│   ├── task.model.ts
│   └── refresh-token.model.ts
├── validators/
│   ├── auth.validator.ts
│   ├── category.validator.ts
│   ├── task.validator.ts
│   ├── voice.validator.ts          [D-014] parseTaskSchema
│   └── common.ts                   objectId, pagination, isoDate primitives
├── services/
│   ├── auth.service.ts
│   ├── token.service.ts            sign / verify / rotate / revoke
│   ├── category.service.ts
│   ├── task.service.ts
│   ├── task.serializer.ts          isOverdue, lateCompletion
│   ├── recurrence.service.ts       next-occurrence arithmetic
│   ├── dashboard.service.ts
│   └── voice.service.ts            [D-014] Whisper transcription + GPT task-draft parsing
├── controllers/
│   ├── health.controller.ts        [exists]
│   ├── auth.controller.ts
│   ├── category.controller.ts
│   ├── task.controller.ts
│   ├── dashboard.controller.ts
│   └── voice.controller.ts         [D-014]
├── routes/
│   ├── index.ts                    [exists] mount point
│   ├── health.routes.ts            [exists]
│   ├── auth.routes.ts
│   ├── category.routes.ts
│   ├── task.routes.ts
│   ├── dashboard.routes.ts
│   └── voice.routes.ts             [D-014] multer upload + voiceLimiter
├── middleware/
│   ├── error-handler.ts            [exists]
│   ├── not-found.ts                [exists]
│   ├── authenticate.ts             Bearer -> req.user
│   ├── validate.ts                 Zod -> req.validated
│   ├── rate-limit.ts
│   └── timezone.ts                 X-Timezone -> req.timezone
├── utils/
│   ├── api-error.ts                [exists]
│   ├── logger.ts                   [exists]
│   ├── async-handler.ts            only if a non-Express-5 path appears
│   └── date.ts                     timezone-aware day boundaries
└── types/
    └── express.d.ts                augments Request with user, timezone, validated
```

---

## Patterns to follow

### Validation — `validate` middleware

One generic middleware, not per-route boilerplate:

```ts
// src/middleware/validate.ts
export const validate =
  (schemas: { body?: ZodType; query?: ZodType; params?: ZodType }) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    req.validated = {
      body: schemas.body ? schemas.body.parse(req.body) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
```

A thrown `ZodError` is already translated to a 400 with `details` by the existing
`error-handler.ts`. Do not catch it in the middleware.

Controllers read `req.validated.body`, **never `req.body`.** Reading `req.body` directly
is reading unvalidated, untyped input, and it is the way an unchecked field reaches a
Mongoose query.

### Authentication — `authenticate` middleware

```ts
// Attaches req.user = { id: string }.
// Throws ApiError.unauthorized() on missing/malformed/expired tokens.
// Does NOT load the user document — the id is all any service needs, and a DB
// round-trip on every request is wasted work (NFR-9). /auth/me loads it explicitly.
```

Mount it on the router, not per-route, so a new route cannot be added unprotected by
omission:

```ts
// src/routes/task.routes.ts
const router = Router();
router.use(authenticate);   // every route below is protected
```

### Ownership scoping — non-negotiable

Every query filters on `userId` **inside** the query:

```ts
// correct
const task = await Task.findOne({ _id: id, userId });
if (!task) throw ApiError.notFound('Task not found');

// WRONG — leaks existence, and a forgotten check is a data breach
const task = await Task.findById(id);
if (task.userId.toString() !== userId) throw ApiError.forbidden();
```

The second form returns another user's document into memory before checking. The first
cannot, and it produces the 404-not-403 behaviour the contract requires.

### Errors

Throw `ApiError`. Express 5 forwards rejected promises from async handlers to the error
middleware automatically, so **route handlers need no `try`/`catch`** and no
`asyncHandler` wrapper. Do not add one.

Already translated by `error-handler.ts`: `ZodError` -> 400, Mongoose `ValidationError`
-> 400, `CastError` -> 400, duplicate key (11000) -> 409. Do not re-handle these.

### Config

Read from `@/config/env`, never `process.env`. New variables go in the Zod schema in
`env.ts` **and** in `.env.example`, in the same commit. A variable in `.env` but not in
the schema is invisible; one in the schema but not in `.env.example` breaks the next clone.

New variables this project needs (task B1.1):

```
JWT_ACCESS_SECRET     required, min 32 chars
JWT_REFRESH_SECRET    required, min 32 chars, must differ from access
JWT_ACCESS_TTL        default '15m'
JWT_REFRESH_TTL       default '30d'
BCRYPT_ROUNDS         default 12
```

Requiring 32 chars minimum in the schema means a placeholder secret fails at boot rather
than shipping.

### Dates and timezones

All timezone-aware arithmetic goes through `src/utils/date.ts`. Nothing else calls
`new Date()` for bucketing:

```ts
startOfDayInTz(date, tz): Date
endOfDayInTz(date, tz): Date
calendarDaysBetween(a, b, tz): number     // whole days, for daysLate (gap G8)
composeDueAt(dueDate, dueTime, tz): { dueAt: Date | null; hasTime: boolean }
addInterval(date, unit, tz): Date         // monthly clamps to last valid day
```

Use `date-fns` + `date-fns-tz`, not hand-rolled offset maths (D-006). Manual UTC offset
arithmetic breaks on DST and on half-hour zones — `Asia/Colombo` is UTC+5:30, so an
off-by-one-hour bug there produces a silently wrong "today".

### Response sending

Controllers send. Services return. One line, no envelope helper:

```ts
res.status(201).json(task);          // created
res.json(task);                      // 200
res.status(204).send();              // no content
```

---

## Things not to do

| Don't | Why |
| ----- | --- |
| Add `asyncHandler` wrappers | Express 5 already forwards async rejections |
| Read `req.body` in a controller | Bypasses validation; use `req.validated.body` |
| Query without `userId` | Cross-tenant data leak |
| Store `isOverdue` or `taskCount` | Stale within hours; see `DATA_MODEL.md` |
| Use `mongoose.Types.ObjectId` in a validator | Validators are transport-layer; validate the hex string, let Mongoose cast |
| Add a `{ data: ... }` response wrapper | Contract says bare resources; the mobile client already expects that |
| Return 403 for another user's resource | Confirms it exists; return 404 |
| Change a response shape without editing both `API_CONTRACT.md` copies | Silent client breakage |
| `console.log` | Use `logger` from `@/utils/logger` |
| Commit `.env` | Only `.env.example` |

---

## Commands

| Command | When |
| ------- | ---- |
| `npm run dev` | Development, hot reload via `tsx watch` |
| `npm run typecheck` | **Before every commit.** Must pass. |
| `npm run lint` | **Before every commit.** Must pass. |
| `npm run format` | Prettier write |
| `npm test` | Once B0.4 lands (Vitest) |
| `npm run build` | Verify the `tsc` + `tsc-alias` build before declaring a phase done |

`tsconfig.json` has `noUncheckedIndexedAccess`, `noUnusedLocals`, and
`noUnusedParameters` on. Array and record access yields `T | undefined` — narrow it, do
not reach for `!`.

---

## Local database

There is **no MongoDB on this machine yet** (see the repo README). Before B1 can run,
pick one:

- **Atlas** — free cluster, no install; set `MONGODB_URI=mongodb+srv://...`
- **Docker** — `docker run -d -p 27017:27017 --name ptt-mongo mongo:7`
- **Local install** — MongoDB Community Server matches the `.env.example` URI

The server refuses to boot without a reachable database, by design. If a session cannot
start the server, this is the first thing to check — and it is tracked as task B0.1.

Note for D-009: replica-set transactions are unavailable on a standalone `mongod`. The
services are written not to need them (see the cascade section of `DATA_MODEL.md`).
