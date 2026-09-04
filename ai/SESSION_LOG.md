# Session Log — Backend

Append-only history. **One entry per working session, max 5 lines**, added at the end of
the session, newest at the bottom.

This is *why things happened*. Current state lives in `PROGRESS.md` — do not duplicate it here.

**Template:**

```
## YYYY-MM-DD — <session focus>
- Done: <task ids completed>
- In progress: <task id + exactly where it stopped, or "none">
- Decisions: <D-NNN added, or "none">
- Notes: <anything the next session would waste time rediscovering>
```

---

## 2026-09-03 — Documentation bootstrap

- Done: none (no code). Analysed all 7 Stitch screens and both repo scaffolds; wrote the
  full `ai/` documentation set: README (session protocol), PRD, API_CONTRACT, DATA_MODEL,
  ARCHITECTURE, TASKS, PROGRESS, DECISIONS, OPEN_QUESTIONS, TESTING.
- In progress: none. Next session starts at B0.1.
- Decisions: D-001 through D-012 recorded. D-008 (voice transcription) is provisional and
  needs the owner.
- Notes: the backend scaffold is **still uncommitted** — `src/`, `package.json`,
  `tsconfig.json` are untracked on top of `e580d87 Initial commit`. Commit before starting
  B0. No MongoDB is installed on this machine, which blocks B0.1 (see `OPEN_QUESTIONS.md` Q6).
- Notes: 12 design gaps (G1–G12) found and given defaults in `PRD.md` §7; the whole set is
  awaiting the owner's verification pass.

---

## 2026-09-03 — Owner verification round 1

- Done: no code. Applied the owner's answers to two open questions across the docs.
- Decisions: **D-013** added (voice UI is the client's, the recognizer is the owner's),
  superseding D-008. **B7.4 dropped** — the backend does no voice work at all.
- Changes: Q1, Q2, Q6 moved to Resolved; B0.1 reworded from "get a MongoDB" to "verify the
  connection" (the owner supplies `MONGODB_URI`); PRD FR-5 note and release scope updated;
  DATA_MODEL seed-script reference corrected from B7.4 to B6.4.
- Notes: **both blockers are now clear** — B0.1 onward is unblocked as soon as the URI is in
  `.env`. If it is not there yet, B0.2 and B0.3 need no database.
- Notes: D-009 (no transactions) still stands **even if the supplied URI turns out to be
  Atlas**. Do not start using transactions on that discovery — that is the exact trap D-009 exists to prevent.

---

## 2026-09-03 (end of day) — session paused

- Done: **no application code.** This session produced documentation only — the `ai/`
  workspace (11 files), `AGENTS.md`, `CLAUDE.md`, and owner verification round 1 applied.
- In progress: none. Nothing half-written. Resume at **B0.1**.
- Decisions: none beyond D-013 earlier today.
- Notes: **`.env` still holds the scaffold placeholder URI** — B0.1 will fail until a real
  `MONGODB_URI` is set. B0.2 and B0.3 need no database, so start there if it is still
  unchanged. The credential belongs in `.env`; `.env.example` is force-tracked by
  `.gitignore` and would be committed.
- Notes: **nothing is committed** — the scaffold and the whole `ai/` folder are untracked on
  top of `e580d87`. Commit before starting B0.
