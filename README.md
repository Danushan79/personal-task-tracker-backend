# personal-task-tracker-backend

REST API for the Personal Task Tracker, built with **Express 5**, **TypeScript**, and **Mongoose**.

## Requirements

- Node.js >= 20 (developed on 24)
- A MongoDB instance (local install, Docker, or MongoDB Atlas)

## Getting started

```bash
npm install
cp .env.example .env   # then edit MONGODB_URI and the JWT secrets
npm run dev
```

The API is served at `http://localhost:4000/api/v1`.

```bash
curl http://localhost:4000/api/v1/health
```

### Getting a MongoDB

- **Atlas (no install):** create a free cluster at <https://cloud.mongodb.com>, then set
  `MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/personal-task-tracker` in `.env`.
- **Docker:** `docker run -d -p 27017:27017 --name ptt-mongo mongo:7`
- **Local install:** MongoDB Community Server, which defaults to the `.env.example` URI.

The server refuses to start without a reachable database, by design — a failed
connection surfaces at boot rather than on the first request.

### Seeding dev data

```bash
npm run seed
```

Creates (or reuses) a dev account — `dev@example.com` / `password123` — with the 4 default
categories and a task fixture spread across today / upcoming / overdue (12 / 28 / 3,
matching the dashboard design mock). Day boundaries are computed in UTC, so view it with
no `X-Timezone` header (or `X-Timezone: UTC`) for the counts to land exactly on 12/28/3.
Safe to re-run — it replaces that account's tasks and categories each time.

## Scripts

| Script                  | Description                                          |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | Start with `tsx watch` (hot reload)                    |
| `npm run build`          | Compile to `dist/` and rewrite `@/*` path aliases      |
| `npm start`              | Run the compiled build                                 |
| `npm run typecheck`      | `tsc --noEmit`                                         |
| `npm run lint`           | ESLint (type-aware rules)                              |
| `npm run lint:fix`       | ESLint with `--fix`                                    |
| `npm run format`         | Prettier write                                         |
| `npm run format:check`   | Prettier check                                         |
| `npm test`               | Run the full test suite once (Vitest)                  |
| `npm run test:watch`     | Vitest in watch mode                                   |
| `npm run test:coverage`  | Vitest with a v8 coverage report                       |
| `npm run seed`           | Fill a dev account with a 12/28/3 task fixture         |

## Project structure

```
src/
├── app.ts                  Express app assembly (middleware + routes)
├── server.ts               Entry point: DB connect, listen, graceful shutdown
├── config/
│   ├── env.ts               Zod-validated environment variables
│   └── db.ts                Mongoose connection lifecycle
├── constants/
│   └── taxonomy.ts          The 10 category icons + 7 colours, single source of truth
├── models/                  Mongoose schemas: User, Category, Task, RefreshToken
├── validators/               Zod request schemas (body/query/params)
├── services/                 Business logic, all Mongoose queries, all cascades
├── controllers/              Thin request handlers — read validated input, call one
│                              service, send the response
├── routes/
│   ├── index.ts              Mounts every feature router under /api/v1
│   ├── auth.routes.ts
│   ├── category.routes.ts
│   ├── task.routes.ts
│   ├── dashboard.routes.ts
│   └── health.routes.ts
├── middleware/
│   ├── authenticate.ts       Bearer -> req.user
│   ├── validate.ts           Zod -> req.validated
│   ├── timezone.ts           X-Timezone -> req.timezone
│   ├── rate-limit.ts         express-rate-limit instances (auth/refresh/global)
│   ├── request-id.ts         Stamps req.id for log correlation
│   ├── sanitize-keys.ts      Strips $-prefixed / dotted keys from req.body
│   ├── error-handler.ts      Terminal error middleware
│   └── not-found.ts          404 catch-all
├── scripts/
│   └── seed.ts               `npm run seed`
└── utils/
    ├── api-error.ts          ApiError with status-code factories
    ├── date.ts               Timezone-aware day boundaries and recurrence arithmetic
    ├── mongo-errors.ts        Duplicate-key (11000) detection helper
    └── logger.ts             Level-aware console logger
```

`@/*` is a path alias for `src/*`, resolved by `tsx` in development and rewritten
by `tsc-alias` at build time.

## Conventions

- **Layering:** `route -> validate -> controller -> service -> model`. Controllers never
  contain business logic; services never see `req`/`res` — a service function is always
  `(userId, input) -> data`, throwing `ApiError` on failure.
- **Errors:** throw `ApiError.badRequest(...)`, `ApiError.notFound(...)`, etc. Express 5
  forwards rejected promises from async handlers to the error middleware, so route
  handlers need no `try`/`catch` wrapper. Zod, Mongoose validation/cast, and duplicate-key
  errors are translated to the right status code automatically.
- **Ownership:** every query filters on `userId` inside the query itself. A resource
  owned by another user returns **404**, never 403 — this never confirms another user's
  data exists.
- **Config:** read values from `@/config/env`, never `process.env` directly — the schema
  is the single source of truth and fails fast on a bad value.
- **Adding a feature:** model in `models/`, a Zod schema in `validators/`, logic in
  `services/`, thin handlers in `controllers/`, a router in `routes/<feature>.routes.ts`,
  then mount it in `routes/index.ts`.

## Authentication

Access is a short-lived JWT; sessions survive app restarts via a rotating refresh token.

1. `POST /auth/register` or `POST /auth/login` returns `{ user, accessToken, refreshToken }`.
2. Send `Authorization: Bearer <accessToken>` on every other route.
3. The access token expires after `JWT_ACCESS_TTL` (default 15 minutes). Call
   `POST /auth/refresh` with the refresh token to get a new pair — the presented refresh
   token is revoked and a new one issued (rotation). Replaying an already-rotated refresh
   token is treated as token theft: the whole token family is revoked and the request
   gets 401.
4. `POST /auth/logout` revokes the current refresh token (idempotent).

A new user starts with zero categories.

## API

Base URL: `/api/v1`. Every response is JSON. Collections are paginated with
`{ items, page, limit, total, hasMore }`; single resources are returned bare. Errors share
one shape: `{ "status": "error", "message": "...", "details"?: [...] }` (`details` only on
validation failures, `stack` only outside production).

Routes that bucket by day (`GET /tasks?bucket=`, `GET /dashboard/summary`) honour an
`X-Timezone: <IANA name>` header (falls back to `UTC`).

| Method | Path                        | Auth | Notes                                                    |
| ------ | --------------------------- | ---- | --------------------------------------------------------- |
| GET    | `/health`                   | no   | Liveness + database status (503 if degraded)               |
| POST   | `/auth/register`            | no   | 201; new user starts with 0 categories                     |
| POST   | `/auth/login`                | no   | 200; same failure message for wrong password/unknown email |
| POST   | `/auth/refresh`               | no   | 200; rotates the refresh token                              |
| POST   | `/auth/logout`                | yes  | 204; idempotent                                             |
| GET    | `/auth/me`                    | yes  | 200                                                          |
| PATCH  | `/auth/me`                    | yes  | 200; `name`/`avatarUrl`/`timezone`                          |
| POST   | `/auth/forgot-password`        | no   | 202 stub — always succeeds, sends nothing                   |
| GET    | `/categories`                  | yes  | `taskCount` = pending tasks unless `includeCompleted=true`  |
| POST   | `/categories`                   | yes  | 201; 409 on a duplicate name (case-insensitive, per user)    |
| GET    | `/categories/:id`                | yes  | 404 if not the caller's                                     |
| PATCH  | `/categories/:id`                | yes  | 200                                                          |
| DELETE | `/categories/:id`                | yes  | 204; `?reassignTo=<id>` moves tasks, otherwise nulls them    |
| GET    | `/tasks`                          | yes  | `bucket`, `status`, `categoryId`, `priority`, `from`/`to`, `q`, `sort`, `page`, `limit` |
| POST   | `/tasks`                          | yes  | 201; 422 if `recurrence` is set without a `dueDate`          |
| GET    | `/tasks/:id`                       | yes  | Adds `lateCompletion`, `rescheduleCount`, `originalDueAt`    |
| PATCH  | `/tasks/:id`                        | yes  | Moves `originalDueAt` on a `dueDate` change (an edit is a correction) |
| DELETE | `/tasks/:id`                        | yes  | 204; hard delete                                             |
| POST   | `/tasks/:id/complete`                | yes  | Idempotent; recurring tasks return `{ task, nextOccurrence }` |
| POST   | `/tasks/:id/reopen`                   | yes  | Idempotent; never touches a spawned occurrence               |
| POST   | `/tasks/:id/reschedule`                | yes  | Leaves `originalDueAt`/`completedAt` alone; 422 if the new date is in the past |
| GET    | `/dashboard/summary`                    | yes  | One `$facet` aggregation; `?itemsPerSection=<1-20>`          |

Full request/response shapes live in [`ai/API_CONTRACT.md`](ai/API_CONTRACT.md) — the
canonical copy, mirrored in the mobile repo.

### Rate limits

| Routes                                                  | Limit                              |
| -------------------------------------------------------- | ------------------------------------ |
| `POST /auth/login`, `/auth/register`, `/auth/forgot-password` | 10 per 15 min per IP           |
| `POST /auth/refresh`                                       | 60 per 15 min per IP               |
| Everything else (authenticated)                             | 300 per 15 min per user            |

Exceeding a limit returns `429` with a `Retry-After` header.

## Testing

```bash
npm test
```

Vitest + Supertest + `mongodb-memory-server` — a real in-memory MongoDB per test run, no
mocked Mongoose. See [`ai/TESTING.md`](ai/TESTING.md) for the full strategy.
