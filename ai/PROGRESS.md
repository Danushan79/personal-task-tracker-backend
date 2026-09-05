# PROGRESS — Backend

> **This is the resume point. Read it first, update it last, every session.**
> Keep it under one screen. It is state, not history — history goes in `SESSION_LOG.md`.

**Last updated:** 2026-09-05 — **end of session, work paused here**
**Updated by:** B1–B6 implementation session (Auth through Hardening)

---

## Where we are

**Phases B0–B6 are all done.** Every endpoint in `API_CONTRACT.md` §1–§7 (23 total) is
implemented, mounted, and tested. **Phase B7 is untouched**, per its own instruction not
to start without the owner's confirmation.

- **B1 Auth:** `User`/`RefreshToken` models, `token.service.ts` (sign/verify/rotate with
  reuse-detection family revocation), `authenticate` middleware, all 8 `/auth/*`
  endpoints, `express-rate-limit` instances (`authLimiter`/`refreshLimiter`/`globalLimiter`
  — the two auth-route limiters skip enforcement under `NODE_ENV=test` so the suite
  doesn't throttle itself; `create*Limiter` factories let a dedicated test exercise real
  429 behaviour in isolation).
- **B2 Categories:** `Category` model (compound unique index with collation for
  case-insensitive per-user names), full CRUD, cascade delete (reassign-then-delete, no
  transactions per D-009).
- **B3/B4 Tasks:** `Task` model, `task.serializer.ts` (a transport-agnostic `TaskLike`
  shape shared by document-based single-task endpoints and the aggregation-based
  list/dashboard queries), full CRUD + bucket filtering (`$facet` + null-last dueAt sort
  via a computed sort key, since Mongo's null ordering is direction-dependent),
  complete/reopen/reschedule, `recurrence.service.ts` (materialised occurrences, D-007).
- **B5 Dashboard:** one `$facet` aggregation (`dashboard.service.ts`) for counts + preview
  sections, render-ordered with zero-total sections omitted.
- **B6 Hardening:** global rate limit wired onto every authenticated router,
  `requestId` middleware + `:id` morgan token for log correlation, `sanitize-keys.ts`
  (strips `$`/dotted keys from `req.body`; `req.query` is untouched — Express 5 exposes it
  as a read-only getter, and every query field already goes through a narrow Zod schema),
  `npm run seed` (12/28/3 dev fixture, UTC-boundary), README rewritten with the full
  endpoint table and auth flow.

Contract deviation worth flagging: the "recurrence without dueDate" 422 rule
(`API_CONTRACT.md` POST/PATCH `/tasks`) is enforced in the **service** layer, not as a Zod
`.refine()` — the shared error handler maps `ZodError` to 400, but the contract requires
422 specifically here, so it's a plain `ApiError` thrown after validation.

---

## Current task

**None in flight.** Tree is clean to resume against.

**Next session, if continuing: B7 needs the owner's go-ahead first** (real forgot-password
needs an email-provider decision, avatar upload needs a storage decision — see
`OPEN_QUESTIONS.md` Q4/Q5). Otherwise this is a natural point to commit and move to wiring
the mobile app against a live backend.

---

## Blockers

**None.** Two things worth the owner's attention, carried over and still true:

- `CORS_ORIGIN=*` + `cors({ credentials: true })` in `app.ts` is contradictory for
  browser clients (not an issue for the mobile app's fetch client or curl/Postman).
- `npm audit`'s pre-existing moderate `qs` advisory (transitive via `express`) is
  unrelated to this session.

New, low-priority items noted rather than fixed (none block anything):

- A worker-fork crash (`exit code 3221226505`) surfaced intermittently (~1 in 4 full-suite
  runs) on Windows when Vitest runs multiple integration test files in parallel, each
  spinning up its own `mongodb-memory-server`. Isolated single-file runs are always green,
  and a full-suite retry always passes. Tried `fileParallelism: false` — it stopped nothing
  and tripled runtime (12s -> 40s), so it was reverted. Treat a red CI run on this repo as
  possibly this, and retry once before treating it as a real failure.

---

## Health of the tree

| Check | State |
| ----- | ----- |
| `npm run typecheck` | **Passing** |
| `npm run lint` | **Passing** |
| `npm run build` | **Passing** — verified the compiled `dist/server.js` boots and serves `/health` |
| `npm test` | **Passing** — 10 files, 75 tests |
| `npm run test:coverage` | ~88% statements / 92% functions — see coverage note below |
| Server boots | **Verified** against the real configured MongoDB — full
  register→login→category→task→complete(recurring)→dashboard flow exercised via curl,
  smoke-test data cleaned up afterward |

**Coverage note:** per `TESTING.md`, 100% is not the goal. Remaining gaps are defensive
branches that are impractical to hit through the HTTP surface (e.g. a non-duplicate-key
DB error mid-`create`, or `jwt.decode` returning something malformed right after `jwt.sign`
produced it) — not documented behaviour left unverified.

### Git — still needs attention

Same standing item as before B1 started: **nothing has been committed.** This session
added the entirety of `src/models`, `src/validators`, `src/services`, `src/controllers`,
`src/routes` (minus what already existed), `src/middleware/{authenticate,rate-limit,
request-id,sanitize-keys}.ts`, `src/scripts/seed.ts`, `tests/factories/`,
`tests/integration/*.test.ts`, plus edits to `app.ts`, `types/express.d.ts`,
`error-handler.ts`, `README.md`, `package.json`. **Commit before starting anything else.**

---

## Contract sync status

`ai/API_CONTRACT.md` — **this repo is canonical.**

| | |
| - | - |
| Last synced with mobile repo | 2026-09-03 |
| In sync? | **Yes** — no contract text changed this session. Every endpoint now matches what was already documented; the mobile repo's copy needs no edit. |

Any edit to the contract here must be mirrored to
`../personal-task-tracker-react-native/ai/API_CONTRACT.md` in the same session, and this
row updated in both repos.

---

## Notes for the next session

- Read `ai/README.md` (session protocol) first, then this file.
- `ai/TASKS.md` checkboxes for B1–B6 are now `[x]`. B7 stays `[ ]` — do not start it
  without the owner's explicit go-ahead (its own header says so).
- The mobile app's sign-up screen (`src/app/(auth)/sign-up.tsx` in the other repo) was
  already fully wired to `POST /auth/register` before this session — it had nothing to
  talk to. It does now. Worth an end-to-end check from the actual app, not just curl.
- `task.serializer.ts`'s `TaskLike` abstraction is the thing to understand before touching
  task-related code: document-based endpoints (`get`/`create`/`update`/`complete`/...) and
  aggregation-based ones (`list`/dashboard) both funnel through the same `serializeTask`/
  `serializeTaskDetail`, via two adapters (`taskLikeFromDocument`/`taskLikeFromAggregate`).
  Don't add a third serialization path — extend one of the two adapters instead.
