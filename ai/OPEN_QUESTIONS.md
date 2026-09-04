# Open Questions

Things only the product owner can settle. **None of these block development** — each has a
working default already reflected in the specs and code.

**How to use this file:**
- Agents: if you hit an unanswerable product question, add it here, take the closest
  sensible default, note the default, and keep working. Never stop and wait.
- Owner: answer in the **Answer** row. When answered, move the entry to the Resolved
  section at the bottom and update whatever spec the answer changes.

This file is **duplicated in the mobile repo** (`../personal-task-tracker-react-native/ai/`)
because most questions affect both. Keep the two in step.

---

## Q3 — Is the "Tasks" tab really a flat list? (design gap G1)

**Context:** both main screens render a Tasks tab in the bottom navigation, but **no
screen was ever designed for it.** It is a real hole in the information architecture, not
a detail.

**Current default:** a full task list reusing the Dashboard's card and section components,
grouped by date (Overdue, Today, Tomorrow, This Week, Later, Completed), with a category
filter chip row at the top. It doubles as the destination for tapping a category row (FR-2.6).

**Answer:** _(pending)_

**Alternatives:** a search-first screen; a calendar/agenda view; a per-category browser.
Any of these changes `GET /tasks` parameters and the mobile M4 phase.

---

## Q4 — Should "Forgot Password" actually work in v1?

**Context:** FR-1.5 — the link exists on the Sign In screen, but **no reset screen was
designed**, so the flow was never thought through visually.

**Current default:** stub. `POST /auth/forgot-password` validates, logs, always returns
202, and sends nothing. The link opens a "check your email" confirmation.

**Answer:** _(pending)_

**Changes if it must work:** an email provider decision (Resend / SendGrid / SES), a
reset-token model, two more endpoints, a deep-linked reset screen, and a from-address on
a verified domain. Roughly a full phase of work.

---

## Q5 — Where do profile avatars come from?

**Context:** FR-1.8 — both main screens show an avatar in the top app bar, sourced from a
Google-hosted stock photo in the mock. **No upload UI is designed anywhere.**

**Current default:** `avatarUrl` is a nullable string on the user. When null, render
initials on a `primary-container` circle. No upload in v1.

**Answer:** _(pending)_

**Changes if upload is wanted:** storage decision (S3 / Cloudinary / GridFS), an upload
endpoint, image resizing, and `expo-image-picker` on the client. Backend task B7.2.

---

## Q7 — Does completing a recurring task really spawn the next one? (design gap G7)

**Context:** the design offers Daily / Weekly / Monthly but never shows what happens on
completion. This is the single largest behavioural unknown in the product.

**Current default:** yes — complete the current occurrence and immediately create the next
(D-007). Monthly clamps to the last valid day (Jan 31 -> Feb 28 -> Mar 28). A stale task
advances repeatedly until its next due date is in the future.

**Answer:** _(pending)_

**Alternative:** the task simply repeats in place, with `dueAt` advanced and no completion
history kept. Simpler, but loses the completion record that FR-3.15's late-completion
alert depends on.

---

## Q8 — Should the "days late" alert appear anywhere other than the detail screen?

**Context:** FR-3.15's alert panel is designed only on Task Details. The dashboard shows
overdue styling but says nothing about lateness after the fact.

**Current default:** detail screen only. `lateCompletion` is returned by
`GET /tasks/:id` and not by `GET /tasks`, keeping list payloads small.

**Answer:** _(pending)_

---

## Q9 — Is there any web target?

**Context:** `task_categories/code.html` contains a full `md:` desktop navigation variant
that no other screen has. The Expo app can build for web.

**Current default:** **no.** Android-first mobile only (NFR-1). The desktop variant is
treated as a Stitch generation artefact.

**Answer:** _(pending)_

---

## Q10 — Priority: three levels or two? (design gap G2)

**Context:** `task_details` shows a "High Priority" badge, but `create_task` has **no
priority control at all** — so priority is displayed and never entered.

**Current default:** three levels (`low` / `medium` / `high`), default `medium`, entered
via a segmented control added to Create/Edit Task. The badge renders only for `high`.

**Answer:** _(pending)_

**Alternative:** a single "important" boolean. Simpler, matches what the design actually
renders, and avoids inventing a control the designer never drew.

---

## Q11 — What are the real Terms and Conditions? (design gap G11)

**Context:** FR-1.4 — sign-up requires accepting terms; the link has no target.

**Current default:** a static in-app screen with placeholder copy. `acceptedTermsAt` is
recorded on the user at registration.

**Answer:** _(pending)_

---

## Resolved

Question IDs are **stable** — resolved entries keep their original number so existing
references in `TASKS.md`, `DECISIONS.md`, and `PRD.md` stay valid.

---

## Q1 — How is voice transcription actually done? — **RESOLVED 2026-09-03**

**Answer (owner):** *"Leave the transcription. I will implement it separately, but create the UI."*

**What this means:**

- **Build the complete voice UI** — the mic button and all its states, the pulse, the
  slide-in transcription panel with its shimmer, interim text, apply-on-finish, and
  cancel-on-second-tap. All of it, to the design.
- **Do not implement speech recognition.** The UI talks to a `VoiceRecognizer` interface;
  a `MockVoiceRecognizer` (pure JS, replaying the prototype's own scripted timings) backs
  it during development. The owner implements the real recognizer separately and swaps it
  in at one registration point.
- **No backend work.** Task B7.4 (server-side STT) is **dropped**.

**Consequences:**

- Voice UI moves **into v1** — it is no longer a v1.1 fast-follow, because there is no
  longer an unresolved technical approach gating it.
- **Expo Go keeps working through the whole of v1.** The mock recognizer is plain
  JavaScript with no native module, so the constraint that pushed this feature to last no
  longer applies.
- The interface contract is specified in the mobile repo's `ai/ARCHITECTURE.md`
  ("Voice capture seam") and built in phase M9.

**Supersedes:** the provisional default in D-008. See D-013 (backend) / D-M11 (mobile).

---

## Q2 — Which languages must voice input support? — **RESOLVED 2026-09-03 (moot)**

**Answer:** follows from Q1 — the owner implements the recognizer, so language support is
decided there. The UI is language-agnostic: it renders whatever string the recognizer
emits, and applies no locale assumptions of its own.

Nothing in this codebase needs to change when the language set changes.

---

## Q6 — Which MongoDB are we developing against? — **RESOLVED 2026-09-03**

**Answer (owner):** *"I will update the MongoDB credentials in the env file."*

The owner supplies `MONGODB_URI` in `.env`. Task B0.1 is therefore **verification, not
setup** — boot the server and confirm `GET /api/v1/health` reports
`"database": "connected"`.

**Note for whoever writes the code:** D-009 (no transactions) still stands regardless of
which MongoDB this turns out to be. Atlas is a replica set and would support transactions;
a standalone local `mongod` would not. Writing code that only works on one of the two is
the failure mode D-009 exists to prevent — so do not start using transactions on
discovering that the supplied URI happens to be Atlas.
