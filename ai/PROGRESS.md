# PROGRESS — Backend

> **This is the resume point. Read it first, update it last, every session.**
> Keep it under one screen. It is state, not history — history goes in `SESSION_LOG.md`.

**Last updated:** 2026-09-04 — **end of session, work paused here**
**Updated by:** B0.1–B0.4 implementation session

---

## Where we are

**Phase:** B0 — Groundwork. **B0.1–B0.4 done.** B1 (Auth) has not started.

This session: the owner supplied a real Atlas `MONGODB_URI` (blocker 1 from the last
update, now resolved) and B0.1–B0.4 were implemented and verified end to end.

- `src/config/env.ts` now validates JWT/bcrypt config too — `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET` (min 32, refined to differ), `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`,
  `BCRYPT_ROUNDS`. Real secrets are in `.env`; `.env.example` has placeholders.
- `src/models/plugins/to-json.ts`, `src/constants/taxonomy.ts` (10 icons / 7 colors),
  `src/types/express.d.ts` (`user`, `timezone`, `validated`), `src/utils/date.ts` (all
  five functions), `src/middleware/validate.ts`, `src/middleware/timezone.ts` (mounted
  globally in `app.ts` since `req.timezone` is non-optional).
- Vitest + Supertest + `mongodb-memory-server`, split into two Vitest **projects**
  (`vitest.config.mts`) so pure unit tests (`src/**/*.test.ts`) never pay the ~800MB
  mongod download cost that only the `tests/**` integration/smoke project needs.
  `tests/setup.ts`, `tests/smoke.test.ts` per `TESTING.md`'s documented shape.
  `tests/tsconfig.json` added so ESLint's type-aware linting covers test files (they
  fall outside the root `tsconfig.json`'s `src`-only `include`).
- `src/models/` is **still** empty apart from `.gitkeep` — no `User`/`Category`/`Task`
  models exist yet. `GET /api/v1/health` is still the only endpoint.

`ai/TASKS.md`: B0.1–B0.4 are `[x]`. Everything from B1 onward is still `[ ]`, except
**B7.4 which is `[-]` dropped**.

---

## Current task

**None in flight.** Nothing is half-written — the tree is clean to resume against.

**Next session starts at B1.1 — `User` model.**

---

## Next 3 tasks

1. **B1.1** — `User` model (`passwordHash` select:false, bcrypt pre-save hook, `toJSON`)
2. **B1.2** — `RefreshToken` model + `token.service.ts` (sign/verify/rotate/revoke)
3. **B1.3** — `authenticate` middleware

---

## Blockers

**None currently.** The MongoDB blocker from the previous update is resolved — the
owner's Atlas URI works and the `tracker` database is confirmed writable (verified
outside this session's TASKS.md flow, then re-verified via the B0.4 smoke test, which
now boots the real app against an in-memory Mongo, not Atlas).

**Two things worth the owner's attention, not blocking B1:**

- `CORS_ORIGIN=*` combined with `cors({ credentials: true })` in `src/app.ts` is
  contradictory — browsers reject wildcard origins on credentialed requests. This will
  need a real origin (or list) before auth cookies/headers are exercised from a browser
  client. Not urgent for API-only testing via curl/Postman/the mobile app's fetch client.
- `npm audit` reports one moderate advisory in `qs` (a transitive dep of
  `express`→`body-parser`), pre-existing, unrelated to this session's changes.

---

## Health of the tree

| Check | State |
| ----- | ----- |
| `npm run typecheck` | **Passing** |
| `npm run lint` | **Passing** |
| `npm run build` | **Passing** |
| `npm run format:check` | **Passing** |
| `npm test` | **Passing** — 2 files, 7 tests (6 unit + 1 smoke) |
| Server boots | **Verified** — `/api/v1/health` returns `200 {"database":"connected"}` against Atlas |

### Git — still needs attention

**Nothing is committed beyond `e580d87 Initial commit`.** This session added more on
top of the already-uncommitted scaffold + `ai/` workspace from last time:

```
 M .gitignore, README.md
?? src/  tests/  package.json  package-lock.json  tsconfig.json  eslint.config.mjs
?? vitest.config.mts  .env.example  .prettierrc.json  .prettierignore
?? ai/  AGENTS.md  CLAUDE.md
```

**Commit before starting B1.** Same advice as last time, now with more riding on it.

---

## Contract sync status

`ai/API_CONTRACT.md` — **this repo is canonical.**

| | |
| - | - |
| Last synced with mobile repo | 2026-09-03 |
| In sync? | **Yes**, unchanged this session — no contract-affecting work happened (B0 is groundwork only). |

Any edit to the contract here must be mirrored to
`../personal-task-tracker-react-native/ai/API_CONTRACT.md` in the same session, and this
row updated in both repos.

---

## Notes for the next session

- Read `ai/README.md` (session protocol) first, then this file, then the one task you are
  about to do. Nothing else.
- **D-009 still stands** even though the owner's URI is Atlas (a replica set, which
  *would* support transactions). Do not start using them — see D-009's reasoning.
- The scaffold's conventions are documented in `ai/ARCHITECTURE.md`. Follow them: no
  `asyncHandler`, never read `req.body` in a controller (`req.validated.body`), every
  query filters on `userId` inside the query itself, not after fetching.
- `src/utils/date.ts`'s DST/half-hour-offset test cases (`src/utils/date.test.ts`) are a
  reference for how to reason about `Asia/Colombo` (+5:30) correctness in later tests —
  reuse the pattern rather than re-deriving it for B3/B4's bucket and lateness tests.
- `ai/PRD.md` §7 lists 12 design gaps with a default decision for each, already reflected
  in the contract and the model. Do not re-decide them; if one looks wrong, note it in
  `OPEN_QUESTIONS.md` and keep going.
