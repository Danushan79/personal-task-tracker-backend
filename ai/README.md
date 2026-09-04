# AI Development Workspace — Backend

This folder is the **memory of the project**. It exists so that any agent (or human)
can stop work at any point and resume days later without re-reading the codebase or
re-deriving decisions that were already made.

> **Repo role:** REST API. Express 5 + TypeScript + Mongoose (MongoDB).
> **Sibling repo:** `../personal-task-tracker-react-native` (Expo mobile client).
> **Design source:** `../stitch_swifttask_android_tracker/` (7 screens + `core_productivity/DESIGN.md`).

---

## Session protocol (read this first, every session)

### 1. Start of session — read in this exact order, and stop there

| Order | File | Why |
| ----- | ---- | --- |
| 1 | `ai/PROGRESS.md` | Where we stopped, what is in flight, what is next. **Always current.** |
| 2 | `ai/TASKS.md` — only the one task you are about to do | The task's acceptance criteria and file list. |
| 3 | The 1–3 spec sections that task references | Contract / model detail for that task only. |

**Do not** read every file in `ai/` at the start of a session. Every task in `TASKS.md`
lists exactly which spec sections it needs. That is the token-saving contract of this folder.

### 2. During the session

- Work **one task at a time**, in `TASKS.md` order, unless `PROGRESS.md` says otherwise.
- The moment you start a task, set its status to `[~]` in `TASKS.md`.
- When a task's acceptance criteria all pass, set it to `[x]` and move on.
- If you make a non-obvious technical choice, append it to `ai/DECISIONS.md` (one short entry).
- If you hit something only the product owner can answer, append it to
  `ai/OPEN_QUESTIONS.md`, pick the documented default, and keep going. Never block.

### 3. End of session — mandatory, do this before you stop

Even if you are stopping mid-task:

1. Update `ai/PROGRESS.md`:
   - `Last updated` date
   - `Current task` + `Exact resume point` (file, function, what is half-written)
   - `Next 3 tasks`
   - Anything broken / any failing check
2. Append one entry to `ai/SESSION_LOG.md` (5 lines max).
3. Make sure `npm run typecheck` and `npm run lint` pass, or record in `PROGRESS.md`
   precisely what fails and why.
4. Commit. Message format: `<task-id>: <what changed>` e.g. `B2.3: category CRUD routes`.

**A session that ends without step 1 has lost the work.** That is the only real failure mode here.

---

## File index

| File | Read when | Changes often? |
| ---- | --------- | -------------- |
| `PROGRESS.md` | **Every session, first.** Resume state. | Every session |
| `TASKS.md` | Every session, the current task only. Phased backlog with IDs. | Every session |
| `SESSION_LOG.md` | When you need history of *why* things moved. Append-only. | Every session |
| `PRD.md` | Once at project start, or when scope is unclear. Product requirements. | Rarely |
| `DATA_MODEL.md` | Any task touching a Mongoose schema. | Per-phase |
| `API_CONTRACT.md` | Any task adding/changing an endpoint. **Shared with the mobile repo.** | Per-phase |
| `ARCHITECTURE.md` | Before writing your first file in a session. Conventions + patterns. | Rarely |
| `TESTING.md` | Any task with a test in its acceptance criteria. | Rarely |
| `DECISIONS.md` | When you are about to re-litigate a choice. Check here first. | Occasionally |
| `OPEN_QUESTIONS.md` | When blocked on product intent. | Occasionally |

---

## Hard rules for this repo

1. **`API_CONTRACT.md` is the shared boundary.** It is duplicated in the mobile repo.
   This repo is **canonical**. If you change it here, the same edit must be applied to
   `../personal-task-tracker-react-native/ai/API_CONTRACT.md` in the same session,
   and noted in both `PROGRESS.md` files. Contract drift between the two repos is the
   single most expensive mistake available.
2. **Never invent an endpoint shape.** If a response field is not in `API_CONTRACT.md`,
   add it to the contract first, then implement it.
3. **Config comes from `@/config/env`**, never `process.env` directly.
4. **Errors are `ApiError`.** Express 5 forwards async rejections to the error handler —
   no `try`/`catch` in route handlers.
5. **Every list endpoint is scoped to `req.user.id`.** A user must never be able to read
   or write another user's tasks or categories. This is checked in the query, not after.
