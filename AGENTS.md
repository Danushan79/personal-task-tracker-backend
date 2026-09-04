# Start here

**Before doing anything else, read [`ai/README.md`](ai/README.md).** It contains the
session protocol: which files to read, in what order, and — critically — what to write
back before you stop.

Then read [`ai/PROGRESS.md`](ai/PROGRESS.md). That is the resume point: where the last
session stopped, what is in flight, and what comes next.

## The short version

| Step | Do |
| ---- | -- |
| **Start** | `ai/PROGRESS.md` -> the single task in `ai/TASKS.md` -> only the spec sections that task names |
| **During** | One task at a time. Mark `[~]` when you start, `[x]` when every acceptance criterion passes. |
| **End** | Update `ai/PROGRESS.md`, append to `ai/SESSION_LOG.md`, ensure typecheck + lint pass, commit. |

**Do not read the whole `ai/` folder at the start of a session.** Every task names exactly
which spec sections it needs. That is the point of the structure.

**A session that ends without updating `ai/PROGRESS.md` has lost the work.**

## Hard rules

1. `ai/API_CONTRACT.md` is **canonical here** and mirrored in
   `../personal-task-tracker-react-native/ai/API_CONTRACT.md`. Change both in the same
   session, or the client breaks silently.
2. Every database query filters on `userId` **inside the query** — never as a post-fetch
   check. See `ai/ARCHITECTURE.md`.
3. No `try`/`catch` in route handlers, and no `asyncHandler`. Express 5 forwards async
   rejections to the error middleware already.
4. Config comes from `@/config/env`, never `process.env`.
5. Conventions are in `ai/ARCHITECTURE.md`. Follow them rather than introducing new patterns.
