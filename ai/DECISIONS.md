# Decision Log — Backend

Append-only. **Check here before re-litigating a technical choice.** One entry per
decision: what was chosen, why, and what it costs. If a decision is reversed, add a new
entry that supersedes the old one — never edit history.

Format: `D-NNN — Title` / Date / Status / Decision / Why / Cost.

---

## D-001 — JWT access + rotating refresh tokens, not sessions
**2026-09-03 · Accepted**

**Decision:** Stateless 15-minute access JWTs, plus 30-day rotating refresh tokens stored
server-side as hashed `jti` values.

**Why:** FR-1.6 requires the session to survive app restarts, and a mobile client has no
cookie jar worth relying on. A pure-JWT setup cannot revoke; a pure-session setup needs a
DB hit on every request (NFR-9). The split gives cheap request auth and a real logout.
Rotation with reuse detection means a stolen refresh token is usable at most once before
the family is revoked.

**Cost:** one extra collection and a rotation code path. Access tokens stay valid for up
to 15 minutes after logout — accepted; the alternative is per-request revocation checks.

---

## D-002 — `dueAt` as one instant plus a `hasTime` flag
**2026-09-03 · Accepted**

**Decision:** Store one UTC `dueAt` and a `hasTime` boolean. The client posts `dueDate`
and `dueTime` separately; the server composes them.

**Why:** FR-3.5 designs date and time as two independent optional inputs, so "due Friday"
and "due Friday 5pm" must be distinguishable. Two stored string fields can contradict each
other and make range queries impossible to index. One instant plus a flag cannot.
Composition is timezone-sensitive and therefore belongs in one server-side place, not in
every client.

**Cost:** the client cannot round-trip its own input verbatim; it re-derives the date and
time from `dueAt` for display.

---

## D-003 — Date-only tasks stored at 23:59:59.999 local, not midnight
**2026-09-03 · Accepted**

**Decision:** A task with a date but no time is stored at end-of-day in the user's timezone.

**Why:** at midnight, a task "due today" is already past its instant for the whole day, so
any minute-granular overdue check flags it immediately. End-of-day keeps it in `today`
until the day ends, which is what the dashboard's "Today" section means.

**Cost:** `dueAt` for a date-only task is not a "clean" timestamp. Mitigated by `hasTime`,
which tells the client to render the date only.

---

## D-004 — Overdue is day-granular, not minute-granular
**2026-09-03 · Accepted**

**Decision:** A task is overdue when `dueAt` is before the **start of the user's current
calendar day**. A task due at 17:00 today is not overdue at 18:00 today.

**Why:** the design labels an overdue task "Yesterday" (FR-3.16) — the unit is days, not
minutes. Minute-granularity would move tasks from Today to Overdue while the user is
looking at the screen, and would make the dashboard's three counts shift through the day.
The design's stated goal is "calm control"; a list that reorders itself at 17:01 is not that.

**Cost:** a task due this morning still reads as "Today" this evening. Correct per the
design's own labelling.

**Consequence:** the same rule gives `lateCompletion` (gap G8) — late means a later
calendar day, so `daysLate` is never 0.

---

## D-005 — `isOverdue`, `lateCompletion`, and `taskCount` are computed, never stored
**2026-09-03 · Accepted**

**Decision:** compute them per request in the serializer / service layer.

**Why:** all three depend on "now" and/or the caller's timezone. A stored `isOverdue` is
wrong within hours and needs a cron to maintain. A stored `taskCount` needs updating in
six places (create, delete, complete, reopen, recategorise, cascade) for a number shown on
one screen.

**Cost:** a `$lookup` or grouped count on the category list, and per-request serialisation
work. Both are cheap at single-user scale and correct at any scale.

---

## D-006 — `date-fns` + `date-fns-tz`, not hand-rolled offset arithmetic
**2026-09-03 · Accepted**

**Decision:** all timezone-aware maths goes through `date-fns-tz` inside `src/utils/date.ts`.

**Why:** manual UTC-offset arithmetic breaks on DST transitions and on half-hour zones.
The likely primary timezone here is `Asia/Colombo` at **UTC+5:30**, where an
offset-in-hours assumption is wrong by 30 minutes and silently shifts every day boundary.
`Intl` alone can format but cannot do interval arithmetic.

**Cost:** two dependencies. Smaller and better-scoped than Luxon or Moment.

---

## D-007 — Materialised recurring occurrences, not virtual RRULE expansion
**2026-09-03 · Accepted**

**Decision:** completing a recurring task inserts the next occurrence as a real document
linked by `recurrenceParentId`.

**Why:** FR-3.10–3.13 let the user edit, reschedule, complete, and delete an individual
task from the detail screen. Every one of those needs a real id to act on. Virtual
expansion produces list rows with no id, and then needs an exception/override table the
moment a single occurrence is edited — which is where calendar codebases go to die.

**Cost:** one insert per completion; completed history grows unbounded. Fine for a
single-user tracker; if it ever matters, add archival.

**Rejected alternative:** store an RRULE and expand at read time. Better for a calendar
with infinite horizons, worse for a task list where each occurrence is individually
actionable.

---

## D-008 — Voice transcription approach: **UNRESOLVED**, default is on-device
**2026-09-03 · SUPERSEDED by D-013**

**Decision (provisional):** on-device speech recognition in the mobile client. **No
backend work.** `TASKS.md` B7.4 exists only for the server-side branch.

**Why provisional:** the design's mic is simulated JavaScript (`create_task/code.html`),
so it constrains nothing. The two real options differ in cost, privacy, and build
requirements — see `OPEN_QUESTIONS.md` Q1.

| | On-device | Server-side (record -> upload -> STT API) |
| - | --------- | ---------------------------------------- |
| Cost | free | per-minute API cost |
| Privacy | audio never leaves the phone | audio leaves the device |
| Accuracy | good, language-dependent | better |
| Build | needs a **dev build**; will not run in Expo Go | works in Expo Go |
| Backend | none | upload endpoint + provider integration |

On-device is the default because it is free, private, and adds no backend surface. Its
real cost is that it breaks Expo Go, which is why FR-5 is scheduled as v1.1 (`PRD.md` §6)
rather than v1 — the core loop must be buildable in Expo Go.

**Resolved by the owner on 2026-09-03 — see D-013. This entry is kept for the trade-off
table, which still describes the options facing whoever implements the recognizer.**

---

## D-013 — Voice: build the UI, defer the recognizer to the owner
**2026-09-03 · Accepted · supersedes D-008**

**Decision:** the mobile client builds the **complete voice capture UI** against a
`VoiceRecognizer` interface. Speech recognition itself is **out of scope for this
codebase** — the owner implements it separately and registers it at one point. The backend
does **no** voice work; task B7.4 is dropped.

**Why:** the owner's instruction — *"leave the transcription, I will implement it
separately, but create the UI."* The design is unambiguous about the UI (states, timings,
copy, and animations are all in `create_task/code.html`), so the UI can be built to spec
today. The recognizer is the part that carried the cost, privacy, and dev-build questions,
and it is being handled elsewhere.

**Consequences for this repo:** none, beyond dropping B7.4. No upload endpoint, no
provider integration, no audio storage, no new environment variables. Should the owner's
implementation later turn out to need a server (a cloud STT proxy, to keep an API key off
the device), that is a **new** decision and a contract change — it is not implied by this one.

**Cost:** the feature ships visually complete but functionally inert until the owner's
recognizer lands. That is the explicit intent, not a compromise.

**Benefit worth noting:** the mock recognizer is plain JavaScript, so **Expo Go keeps
working through the whole of v1** — which was the constraint that had pushed this feature
to a v1.1 fast-follow in the first place.

---

## D-009 — No MongoDB transactions
**2026-09-03 · Accepted**

**Decision:** services do not use transactions. Multi-write operations are ordered so
that any partial failure leaves recoverable state.

**Why:** transactions require a replica set. `.env.example` defaults to a standalone
`mongod`, and Atlas free tier is a replica set but a local install typically is not.
Writing code that only works on one of the two supported setups guarantees a
"works on my machine" bug.

**Cost:** category deletion is two writes. Mitigated by ordering: reassign first, then
delete, so the bad interleaving leaves tasks correctly reassigned with a stale category
row present, rather than tasks pointing at a deleted category.

**Revisit if** the deployment target becomes a replica set for certain.

---

## D-010 — 404, not 403, for another user's resource
**2026-09-03 · Accepted**

**Decision:** any resource not owned by the caller returns 404, and `userId` is part of
the query filter rather than a post-fetch check.

**Why:** 403 confirms the resource exists, which is an enumeration oracle. Filtering
inside the query also means another user's document is never loaded into memory, so a
forgotten ownership check cannot leak data — the query simply finds nothing.

**Cost:** a genuine 403 case would be indistinguishable. There is no such case in v1.

---

## D-011 — Bare resources, no `{ data: ... }` envelope
**2026-09-03 · Accepted**

**Decision:** single resources are returned bare; collections use
`{ items, page, limit, total, hasMore }`; errors keep the existing
`{ status, message, details }`.

**Why:** the mobile repo's `src/api/client.ts` already returns the parsed payload directly
as `T`, and `/health` already returns bare. Adding an envelope now means touching every
call site in both repos for no gain.

**Cost:** no room for top-level metadata on single-resource responses. Not needed.

---

## D-012 — One `/dashboard/summary` endpoint, not four parallel calls
**2026-09-03 · Accepted**

**Decision:** counts and section previews come from a single `$facet` aggregation behind
one endpoint, with sections pre-sorted into render order.

**Why:** FR-4.1 and FR-4.3 put counts and lists on screen together, and they must agree.
Four independent calls can interleave with a mutation and render "12" above 11 rows.
`$facet` also makes it one round-trip instead of five (NFR-9). Returning sections in
render order and omitting empty ones moves ordering and empty-state logic out of the client.

**Cost:** one non-obvious aggregation to maintain, and a response shape coupled to one
screen. Accepted — it is the highest-traffic screen in the product.
