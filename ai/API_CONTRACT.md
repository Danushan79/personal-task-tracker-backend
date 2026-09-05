# API Contract — v1

> **CANONICAL COPY.** This file is duplicated at
> `../personal-task-tracker-react-native/ai/API_CONTRACT.md`.
> Any edit here **must** be mirrored there in the same session, and noted in both
> `PROGRESS.md` files. Contract drift between the two repos is the single most
> expensive mistake available on this project.

**Base URL:** `/api/v1`
**Content type:** `application/json` on every request and response.
**Auth:** `Authorization: Bearer <accessToken>` on every route except
`/health`, `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/forgot-password`.

---

## Conventions

### Success shapes

- **Single resource** — returned bare, not wrapped: `{ "id": "...", "title": "..." }`
- **Collection** — always paginated, always this envelope:
  ```json
  { "items": [ ... ], "page": 1, "limit": 20, "total": 57, "hasMore": true }
  ```
- **No body** — `204 No Content`.

There is deliberately no `{ data: ... }` wrapper. The existing
`src/api/client.ts` in the mobile repo returns the parsed payload directly as `T`,
and `/health` already returns bare. Consistency with what exists beats ceremony.

### Error shape

Every non-2xx response uses the envelope already implemented in
`src/middleware/error-handler.ts`:

```json
{
  "status": "error",
  "message": "Validation failed",
  "details": [ { "path": ["title"], "message": "Title is required" } ]
}
```

`details` appears only for validation failures. `stack` appears only outside production.

### Status codes

| Code | Used for |
| ---- | -------- |
| 200 | Successful GET / PATCH / action |
| 201 | Resource created (`POST /tasks`, `POST /categories`, `POST /auth/register`) |
| 204 | Successful DELETE / logout |
| 400 | Validation failure (Zod), bad ObjectId cast |
| 401 | Missing, malformed, or expired access token |
| 403 | Valid token, but the resource belongs to another user |
| 404 | Resource does not exist, **or** exists but belongs to another user (see below) |
| 409 | Duplicate — email already registered, category name already used |
| 422 | Semantically invalid but syntactically fine (e.g. `reassignTo` points at the category being deleted) |
| 429 | Rate limit exceeded on auth routes |
| 500 | Unexpected |

**Ownership rule:** a resource owned by another user returns **404, not 403.** Never
confirm the existence of another user's data. 403 is reserved for cases where ownership
is already public knowledge — in practice, unused in v1.

### IDs and dates

- IDs are Mongo ObjectId hex strings, serialised as `id` (never `_id`, never `__v`).
- All timestamps are **ISO-8601 UTC with `Z`**: `2026-09-03T17:00:00.000Z`.
- `dueAt` is a single instant, not a date + time pair. The client composes the two
  designed inputs (FR-3.5) into one value before sending. See the `dueAt` note below.

### Timezone header

Any endpoint that buckets by day (`/tasks?bucket=`, `/dashboard/summary`) accepts:

```
X-Timezone: Asia/Colombo
```

An IANA timezone name. Falls back to `UTC` when absent or unrecognised. This is what
makes "today" mean the user's today (NFR-11).

---

## 1. Health

### `GET /health`

Already implemented. No auth.

```json
{ "status": "ok", "uptime": 128, "timestamp": "2026-09-03T17:00:00.000Z", "database": "connected" }
```

`503` with `"status": "degraded"` when the database is not connected.

---

## 2. Auth

### `POST /auth/register` — 201

```json
{ "name": "Danushan", "email": "d@example.com", "password": "hunter2hunter2", "acceptedTerms": true }
```

| Field | Rules |
| ----- | ----- |
| `name` | required, 1–80 chars, trimmed |
| `email` | required, valid email, lowercased and trimmed before storing |
| `password` | required, 8–72 chars (72 is the bcrypt input limit) |
| `acceptedTerms` | required, must be exactly `true` (FR-1.4) |

**Response 201:**

```json
{
  "user": { "id": "66f...", "name": "Danushan", "email": "d@example.com", "avatarUrl": null, "createdAt": "..." },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**409** if the email is already registered — message `"Email already registered"`.

A new user starts with zero categories — the client renders the FR-3.3 pill row's empty
state until the user creates their own.

### `POST /auth/login` — 200

```json
{ "email": "d@example.com", "password": "hunter2hunter2" }
```

Response is identical in shape to register. **401** on either a wrong password or an
unknown email, with the same message — `"Invalid email or password"` — so the endpoint
cannot be used to enumerate accounts.

### `POST /auth/refresh` — 200

```json
{ "refreshToken": "eyJ..." }
```

```json
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

Refresh tokens **rotate**: the presented token is revoked and a new one issued. Presenting
an already-revoked token revokes the whole family and returns **401** (reuse detection).

### `POST /auth/logout` — 204

```json
{ "refreshToken": "eyJ..." }
```

Revokes that refresh token. Idempotent — an unknown token still returns 204.

### `GET /auth/me` — 200 — authenticated

```json
{ "id": "66f...", "name": "Danushan", "email": "d@example.com", "avatarUrl": null, "createdAt": "...", "timezone": "Asia/Colombo" }
```

### `PATCH /auth/me` — 200 — authenticated

Any subset of `{ "name": "...", "avatarUrl": "...", "timezone": "..." }`.
Serves the Profile screen from gap G4. Email and password changes are **not** in v1.

### `POST /auth/forgot-password` — 202

```json
{ "email": "d@example.com" }
```

Always `202` with `{ "message": "If that email is registered, a reset link has been sent." }`
regardless of whether the account exists. **v1 is a stub** — it validates, logs, and sends
nothing. FR-1.5 only requires the affordance; there is no reset screen in the designs.

### Token lifetimes

| Token | Lifetime | Storage | Claims |
| ----- | -------- | ------- | ------ |
| Access | 15 minutes | client memory + `expo-secure-store` | `sub` (user id), `iat`, `exp` |
| Refresh | 30 days, rotating | `expo-secure-store` only | `sub`, `jti`, `iat`, `exp` |

Refresh token `jti` values are stored server-side (hashed) so they can be revoked.

---

## 3. Categories

All routes authenticated and scoped to the caller.

### `GET /categories` — 200

Not paginated in practice, but uses the collection envelope for consistency.
`limit` defaults to 100.

```json
{
  "items": [
    { "id": "66f...", "name": "Work", "icon": "work", "color": "#0058bd", "taskCount": 12, "createdAt": "..." }
  ],
  "page": 1, "limit": 100, "total": 4, "hasMore": false
}
```

`taskCount` counts **incomplete** tasks only. The designs show "12 tasks" as a live
workload figure (FR-2.4); counting completed history would make it meaningless.

Query params: `includeCompleted=true` switches `taskCount` to all tasks.

### `POST /categories` — 201

```json
{ "name": "Study", "icon": "school", "color": "#00acc1" }
```

| Field | Rules |
| ----- | ----- |
| `name` | required, 1–40 chars, trimmed, unique per user case-insensitively (FR-2.9) |
| `icon` | required, one of the 10 allowed values (see below) |
| `color` | required, one of the 7 allowed hex values, lowercase |

**409** on a duplicate name — `"A category with that name already exists"`.

**Allowed `icon`:** `work`, `shopping_cart`, `favorite`, `book`, `home`, `flight`,
`fitness_center`, `school`, `restaurant`, `pets`

**Allowed `color`:** `#0058bd`, `#ba1a1a`, `#388e3c`, `#fbc02d`, `#8e24aa`, `#00acc1`, `#e64a19`

Both are closed enums, exactly matching the `new_category` grid and swatches. The client
renders from the same lists; an open string field would let the client store an icon it
cannot draw.

### `GET /categories/:id` — 200

Single category, same fields as a list item.

### `PATCH /categories/:id` — 200

Any subset of `{ name, icon, color }`. Same validation as create.

### `DELETE /categories/:id` — 204

| Query param | Behaviour |
| ----------- | --------- |
| *(none)* | Tasks in this category become **uncategorised** (`categoryId: null`). Valid per FR-2.8. |
| `?reassignTo=<categoryId>` | Tasks move to that category. |

**422** if `reassignTo` equals `:id`, or names a category that does not exist / is not
the caller's. Resolves FR-2.7 — deletion never orphans a task.

---

## 4. Tasks

All routes authenticated and scoped to the caller.

### `GET /tasks` — 200

| Param | Type | Default | Notes |
| ----- | ---- | ------- | ----- |
| `bucket` | `today` \| `upcoming` \| `overdue` \| `completed` \| `nodate` | — | Day-relative, resolved in `X-Timezone`. Mutually exclusive with `from`/`to`. |
| `status` | `pending` \| `completed` | `pending` | `bucket=completed` implies `status=completed`. |
| `categoryId` | ObjectId \| `none` | — | `none` returns uncategorised tasks. Serves FR-2.6. |
| `priority` | `low` \| `medium` \| `high` | — | |
| `from`, `to` | ISO date/datetime | — | Inclusive `dueAt` window. |
| `q` | string | — | Case-insensitive substring on `title`. Not a designed feature; present for the Tasks screen only. |
| `sort` | `dueAt` \| `-dueAt` \| `createdAt` \| `-createdAt` \| `priority` | `dueAt` | Tasks with no `dueAt` sort last regardless of direction. |
| `page` | int >= 1 | 1 | |
| `limit` | int 1–100 | 20 | |

**Bucket definitions** (all in `X-Timezone`, all with `status=pending` unless stated):

| Bucket | Definition |
| ------ | ---------- |
| `today` | `dueAt` falls within the user's current calendar day |
| `upcoming` | `dueAt` is after the end of the user's current calendar day |
| `overdue` | `dueAt` is before the start of the user's current calendar day |
| `nodate` | `dueAt` is null |
| `completed` | `status = completed`, sorted `-completedAt` |

Note that `overdue` is **day-granular, not minute-granular**: a task due at 5pm today is
not overdue at 6pm today. This keeps the dashboard stable through the working day and
matches the design's "Yesterday" label (FR-3.16), and it is the same rule as the
late-completion definition (gap G8).

**Response:**

```json
{
  "items": [
    {
      "id": "66f...",
      "title": "Review Q3 Financials",
      "description": null,
      "category": { "id": "66f...", "name": "Work", "icon": "work", "color": "#0058bd" },
      "dueAt": "2026-09-03T04:30:00.000Z",
      "hasTime": true,
      "priority": "medium",
      "recurrence": "none",
      "status": "pending",
      "completedAt": null,
      "isOverdue": false,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "page": 1, "limit": 20, "total": 12, "hasMore": false
}
```

`category` is **embedded, not a bare id.** Every task card in the designs renders the
category name and colour (`task_dashboard` pills, `task_details` card). Returning an id
would force the client into an N+1 or a client-side join on every list render.

`isOverdue` is **computed server-side** and never stored. It depends on "now" and on the
caller's timezone, so a stored boolean would be wrong within hours.

`hasTime` distinguishes "due Friday" from "due Friday at 5pm". FR-3.5 designs date and
time as independent optional inputs, so a task can have a date with no meaningful time.
When `hasTime` is `false`, `dueAt` is stored at 23:59:59.999 local and the client renders
the date only.

### `POST /tasks` — 201

```json
{
  "title": "Review Q3 Financials",
  "description": "Pull the CRM numbers first.",
  "categoryId": "66f...",
  "dueDate": "2026-09-03",
  "dueTime": "10:00",
  "priority": "medium",
  "recurrence": "none"
}
```

| Field | Rules |
| ----- | ----- |
| `title` | **required**, 1–200 chars, trimmed |
| `description` | optional, max 2000 chars, `null` allowed |
| `categoryId` | optional, must be the caller's category, `null` allowed (FR-2.8) |
| `dueDate` | optional, `YYYY-MM-DD` |
| `dueTime` | optional, `HH:mm` 24h. **Ignored unless `dueDate` is present.** |
| `priority` | optional, `low` \| `medium` \| `high`, default `medium` (gap G2) |
| `recurrence` | optional, `none` \| `daily` \| `weekly` \| `monthly`, default `none` |

The client sends `dueDate` and `dueTime` **separately**, exactly as the two designed
inputs produce them, and the server composes `dueAt` and `hasTime` using `X-Timezone`.
Date composition is the one thing a client is most likely to get wrong, so it happens in
one place, server-side.

**422** if `recurrence` is not `none` while `dueDate` is absent — a repeating task with no
first occurrence has no defined next occurrence.

Response: the created task, in the same shape as a list item.

### `GET /tasks/:id` — 200

The full task, plus the fields only the detail screen needs (FR-3.15, gap G8):

```json
{
  "id": "66f...",
  "title": "Finalize Q3 Marketing Architecture & Strategy Deck",
  "description": "Compile final metrics from the CRM...",
  "category": { "id": "...", "name": "Work", "icon": "work", "color": "#0058bd" },
  "dueAt": "2026-10-10T11:30:00.000Z",
  "hasTime": true,
  "priority": "high",
  "recurrence": "monthly",
  "status": "completed",
  "completedAt": "2026-10-12T06:00:00.000Z",
  "isOverdue": false,
  "lateCompletion": { "isLate": true, "daysLate": 2, "completedOn": "2026-10-12" },
  "rescheduleCount": 0,
  "originalDueAt": "2026-10-10T11:30:00.000Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`lateCompletion` is `null` unless the task is completed and late. It is a computed object
rather than two loose fields because the design renders it as one atomic alert panel:
*"marked complete on Oct 12, which is 2 days past the original deadline."* `daysLate` is
whole calendar days in the user's timezone, minimum 1 (gap G8).

`originalDueAt` is the due date **as first set**, preserved across reschedules — the
design's panel says *"past the original deadline"*, and the detail card is labelled
"ORIGINAL DEADLINE", so a reschedule must not silently erase the miss.

### `PATCH /tasks/:id` — 200

Any subset of the `POST /tasks` body. Serves the Edit Task screen (gap G3).

- Sending `"dueDate": null` clears the due date and forces `recurrence` to `none`.
- Editing `dueDate` here **does** move `originalDueAt` — an edit is a correction. A
  *reschedule* does not. That is the whole reason the two are separate endpoints.

### `DELETE /tasks/:id` — 204

Hard delete. FR-3.11's dialog says *"permanent and cannot be undone"*, so no soft delete
and no undo. If undo is ever wanted, this becomes a soft delete — a contract change.

### `POST /tasks/:id/complete` — 200

No body. Idempotent — completing a completed task is a no-op returning the same task.

Sets `status: completed` and `completedAt: now`. Computes `lateCompletion`.

**For a recurring task** (gap G7), the response carries the spawned occurrence:

```json
{
  "task": { "...the completed occurrence, status: completed..." },
  "nextOccurrence": { "...a new pending task, dueAt advanced by the recurrence rule..." }
}
```

For a non-recurring task the response is the bare task object, with no wrapper. The client
must branch on the presence of `nextOccurrence`.
`recurrence: none` -> bare task. Anything else -> the wrapped shape.

### `POST /tasks/:id/reopen` — 200

No body. Serves FR-3.13 "Mark Incomplete". Sets `status: pending`, clears `completedAt`.
Idempotent. Does **not** delete any occurrence that `complete` spawned — deciding to
un-complete does not retract a next occurrence the user may already have edited.

### `POST /tasks/:id/reschedule` — 200

```json
{ "dueDate": "2026-09-05", "dueTime": "09:00" }
```

Serves FR-3.12. Same date rules as `POST /tasks`. Increments `rescheduleCount`, leaves
`originalDueAt` untouched, and — if the task was completed — leaves `completedAt` alone.

**422** if the new `dueAt` is in the past.

---

## 5. Dashboard

### `GET /dashboard/summary` — 200 — authenticated

The single call behind the whole dashboard screen. Serves FR-4.1 through FR-4.4.

```json
{
  "counts": { "today": 12, "upcoming": 28, "overdue": 3, "completedToday": 5, "noDate": 2 },
  "sections": [
    { "key": "today",   "label": "Today",   "total": 12, "items": [ /* up to 5 tasks */ ] },
    { "key": "overdue", "label": "Overdue", "total": 3,  "items": [ /* up to 5 tasks */ ] }
  ],
  "generatedAt": "2026-09-03T09:00:00.000Z",
  "timezone": "Asia/Colombo"
}
```

- `counts` fills the three tiles. `completedToday` and `noDate` are returned for the
  Tasks screen; the dashboard ignores them.
- `sections` are returned **in render order** — `today` before `overdue`, per FR-4.4 —
  so the client never re-sorts. A section with `total: 0` is **omitted**, which is what
  makes the empty-state logic (gap G9) trivial on the client.
- `items` is capped at 5 per section. `total` gives the real count, so the client can
  render a "View all N" link into the Tasks tab.
- Section items use the same task shape as `GET /tasks`.

`?itemsPerSection=<1..20>` overrides the cap.

One endpoint rather than four parallel calls: the design shows counts and lists that must
agree with each other. Four calls can interleave with a mutation and render 12 in the tile
above 11 rows. `generatedAt` makes the snapshot explicit.

---

## 6. Rate limits

| Routes | Limit |
| ------ | ----- |
| `POST /auth/login`, `/auth/register`, `/auth/forgot-password` | 10 per 15 min per IP |
| `POST /auth/refresh` | 60 per 15 min per IP |
| Everything else | 300 per 15 min per authenticated user |

Exceeding a limit returns **429** with the standard error envelope and a `Retry-After` header.

---

## 7. Endpoint summary

| Method | Path | Auth | Serves |
| ------ | ---- | ---- | ------ |
| GET | `/health` | no | infra |
| POST | `/auth/register` | no | FR-1.1, FR-1.4 |
| POST | `/auth/login` | no | FR-1.2 |
| POST | `/auth/refresh` | no | FR-1.6 |
| POST | `/auth/logout` | yes | gap G4 |
| GET | `/auth/me` | yes | FR-1.6, FR-1.8 |
| PATCH | `/auth/me` | yes | gap G4 |
| POST | `/auth/forgot-password` | no | FR-1.5 (stub) |
| GET | `/categories` | yes | FR-2.4 |
| POST | `/categories` | yes | FR-2.1–2.3 |
| GET | `/categories/:id` | yes | FR-2.5 |
| PATCH | `/categories/:id` | yes | FR-2.5 |
| DELETE | `/categories/:id` | yes | FR-2.5, FR-2.7 |
| GET | `/tasks` | yes | gap G1, FR-2.6 |
| POST | `/tasks` | yes | FR-3.1–3.7 |
| GET | `/tasks/:id` | yes | FR-3.15, gap G12 |
| PATCH | `/tasks/:id` | yes | FR-3.10, gap G3 |
| DELETE | `/tasks/:id` | yes | FR-3.11 |
| POST | `/tasks/:id/complete` | yes | FR-3.8, FR-3.14, gap G7 |
| POST | `/tasks/:id/reopen` | yes | FR-3.13 |
| POST | `/tasks/:id/reschedule` | yes | FR-3.12, gap G6 |
| GET | `/dashboard/summary` | yes | FR-4.1–4.4 |

23 endpoints. Every one traces to a requirement; no requirement lacks an endpoint.
