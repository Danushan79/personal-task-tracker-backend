# Product Requirements — TaskTracker (Personal Task Tracker)

**Status:** Draft v1, derived from design analysis on 2026-09-03. Awaiting product-owner verification.
**Derived from:** `../stitch_swifttask_android_tracker/` — 7 designed screens + `core_productivity/DESIGN.md`.

---

## 1. Product summary

TaskTracker is a **single-user personal task manager** for Android (Expo/React Native)
backed by a REST API. A user signs up, organises tasks into colour-and-icon-coded
categories, and works from a dashboard that surfaces what is due today, what is coming
up, and what is overdue.

The design system's stated intent (`DESIGN.md`) is **"Functional Minimalism"** for
*"busy professionals and students who require a reliable, no-friction tool for daily
organization"*, targeting an emotional response of **"calm control and efficiency."**

**Not a team product.** Nothing in any screen shows sharing, assignment, collaborators,
or comments. All data is private to the owning user. Multi-user collaboration is
explicitly out of scope for v1.

---

## 2. Evidence base — the 7 designed screens

| # | Screen | Folder | Type |
| - | ------ | ------ | ---- |
| 1 | Sign In | `sign_in/` | Auth |
| 2 | Sign Up | `sign_up/` | Auth |
| 3 | Task Dashboard | `task_dashboard/` | Main tab 1 |
| 4 | Create Task | `create_task/` | Transactional (modal) |
| 5 | Task Details | `task_details/` | Detail |
| 6 | Task Categories | `task_categories/` | Main tab 3 |
| 7 | New Category | `new_category/` | Transactional |

Screens 3 and 6 both render a 3-item bottom navigation bar — **Dashboard, Tasks,
Categories** — so a **Tasks list screen exists in the information architecture but was
never designed**. See section 7, gap G1.

---

## 3. Functional requirements

### FR-1 Authentication

| ID | Requirement | Evidence |
| -- | ----------- | -------- |
| FR-1.1 | User registers with **full name, email, password** | `sign_up` form fields |
| FR-1.2 | User signs in with **email + password** | `sign_in` form fields |
| FR-1.3 | Password field has a **show/hide toggle** | `visibility_off` button on both screens |
| FR-1.4 | Sign-up requires **accepting Terms and Conditions** (link present) | `sign_up` terms text |
| FR-1.5 | A **"Forgot Password?"** affordance exists on sign-in | `sign_in` link |
| FR-1.6 | Session persists across app restarts; user lands on Dashboard, not Sign In | Implied — no splash/loading screen designed |
| FR-1.7 | Each user's tasks and categories are **private to that user** | Single-user product |
| FR-1.8 | User has a **profile avatar** shown in the top app bar | Avatar image in `task_dashboard` and `task_categories` |

### FR-2 Categories

| ID | Requirement | Evidence |
| -- | ----------- | -------- |
| FR-2.1 | User creates a category with a **name** | `new_category` text input, placeholder "e.g., Work, Shopping" |
| FR-2.2 | User picks an **icon** from a fixed set of 10 | `new_category` 5x2 icon grid |
| FR-2.3 | User picks a **theme colour** from a fixed set of 7 | `new_category` colour swatches |
| FR-2.4 | Categories are listed with icon, name, and **live task count** | `task_categories` — "Work / 12 tasks" |
| FR-2.5 | A category row has an **overflow menu** (`more_vert`) for Edit and Delete | `task_categories` per-row button |
| FR-2.6 | Tapping a category row **filters the task list to that category** | Row is `cursor-pointer` with a hover state |
| FR-2.7 | Deleting a category must resolve its tasks (reassign or uncategorise) | Inferred from FR-2.4 counts |
| FR-2.8 | A task's category is optional — "uncategorised" is valid | `create_task` marks no category as required |
| FR-2.9 | Category names are unique per user | Inferred; prevents ambiguous pills |

Designed icon set: `work`, `shopping_cart`, `favorite`, `book`, `home`, `flight`,
`fitness_center`, `school`, `restaurant`, `pets`.

Designed colour set: `#0058bd` blue, `#ba1a1a` red, `#388e3c` green, `#fbc02d` yellow,
`#8e24aa` purple, `#00acc1` cyan, `#e64a19` orange.

### FR-3 Tasks

| ID | Requirement | Evidence |
| -- | ----------- | -------- |
| FR-3.1 | Task has a **title** (required) | `create_task` — "What needs to be done?", `required` |
| FR-3.2 | Task has an optional **multi-line description** | `create_task` — 3-row textarea, "Add details..." |
| FR-3.3 | Task has an optional **category**, chosen from horizontally scrolling pills | `create_task` category pill row |
| FR-3.4 | The pill row ends with a **"+ New"** pill that opens New Category | `create_task` last pill is `add` icon + "New" |
| FR-3.5 | Task has an optional **due date** and optional **due time** (separate inputs) | `create_task` date input + time input |
| FR-3.6 | Task has a **recurrence**: Does not repeat / Daily / Weekly / Monthly | `create_task` select options |
| FR-3.7 | Task has a **priority**; High renders as a badge | `task_details` — "High Priority" pill |
| FR-3.8 | Task is **completed / not completed**, toggled by a checkbox in the list | `task_dashboard` checkboxes |
| FR-3.9 | Completing a task **strikes through its title** in the list | `group-has-[:checked]:line-through` |
| FR-3.10 | Task can be **edited** | `task_details` pencil icon |
| FR-3.11 | Task can be **deleted, behind a confirmation dialog** | `task_details` delete button + `dialog-overlay` |
| FR-3.12 | Task can be **rescheduled** from the detail screen | `task_details` "Reschedule" button |
| FR-3.13 | A completed task can be **marked incomplete again** | `task_details` "Mark Incomplete" button |
| FR-3.14 | The system records **when** a task was completed | Required by FR-3.15 |
| FR-3.15 | **Late completion is surfaced**: if completed after the due date, show an alert with the completion date and the number of days late | `task_details` "Late Completion" panel — *"marked complete on Oct 12, which is 2 days past the original deadline"* |
| FR-3.16 | An **overdue** task (past due, not complete) gets a 2px left border in `error` and a red relative timestamp | `task_dashboard` — `border-l-2 border-error`, "Yesterday" in red |
| FR-3.17 | Due time renders as a **relative label** where natural ("Yesterday"), else absolute ("10:00 AM") | `task_dashboard` task cards |

### FR-4 Dashboard

| ID | Requirement | Evidence |
| -- | ----------- | -------- |
| FR-4.1 | Three **count tiles**: Today, Upcoming, Overdue | `task_dashboard` bento grid — 12 / 28 / 3 |
| FR-4.2 | The **Overdue tile is visually distinct** (error-container fill) | `bg-error-container` |
| FR-4.3 | Tasks are grouped into **labelled sections** — "Today", "Overdue" (with a warning icon) | `task_dashboard` section headings |
| FR-4.4 | Sections are ordered so **Today leads**, Overdue follows | Designed order on `task_dashboard` |
| FR-4.5 | A **FAB** creates a new task from anywhere in the main shell | FAB on `task_dashboard` and `task_categories` |
| FR-4.6 | Counts and lists refresh after any task mutation | Implied by FR-4.1 accuracy |

### FR-5 Voice capture (headline feature)

| ID | Requirement | Evidence |
| -- | ----------- | -------- |
| FR-5.1 | Create Task shows a **prominent 64px mic button** above the form, labelled "Tap to speak" | `create_task` `#voiceBtn`, centre-stage placement |
| FR-5.2 | Tapping it starts capture: button turns **error-container red**, icon **pulses**, label becomes **"Listening..."** | `create_task` inline script |
| FR-5.3 | A **live transcription panel** slides in below, showing interim text with a shimmer | `#transcriptionBox`, `#transcriptionText`, `.shimmer` |
| FR-5.4 | On completion, the transcript is **written into the Task Title field** | Script sets `taskTitleInput.value` |
| FR-5.5 | Tapping the mic again **cancels** capture without applying the transcript | Script calls `stopRecording(false)` |
| FR-5.6 | Capture requires microphone permission, requested at first use | Platform requirement |

**Scope split (owner decision, 2026-09-03):** the **UI is in scope and ships in v1** —
every state, animation, and piece of copy above. **Speech recognition is not** — the owner
implements it separately, behind the `VoiceRecognizer` interface. See
`ai/OPEN_QUESTIONS.md` Q1 (resolved) and the D-013 / D-M11 decision entries.

The prototype's mic behaviour is simulated JavaScript, which is exactly what the shipped
mock recognizer reproduces during development.

### FR-6 Navigation shell

| ID | Requirement | Evidence |
| -- | ----------- | -------- |
| FR-6.1 | Bottom nav with 3 tabs: **Dashboard, Tasks, Categories** | Both main screens |
| FR-6.2 | The active tab is a **filled pill** in `primary-container` | `task_dashboard` active button styling |
| FR-6.3 | Transactional screens (Create Task, New Category, Task Details) **suppress the bottom nav** | Explicit HTML comments in all three files |
| FR-6.4 | Create Task uses a modal-style header: **close / "New Task" / Save** | `create_task` header |
| FR-6.5 | Task Details uses a contextual header: **back / edit / delete** | `task_details` header |
| FR-6.6 | `task_categories` has a **hamburger menu** in the top bar | `menu` icon — target undesigned, see gap G4 |

---

## 4. Non-functional requirements

| ID | Requirement |
| -- | ----------- |
| NFR-1 | **Platform:** Android first (folder name, `predictiveBackGestureEnabled`, Material Symbols). iOS must not break, but Android is the tuned target. |
| NFR-2 | **Touch targets:** minimum 48x48dp for every interactive element, even where the visual is smaller (`DESIGN.md`, Layout). |
| NFR-3 | **Motion:** 200–300ms ease-in-out on all transitions (`DESIGN.md`, Brand and Style). |
| NFR-4 | **Grid:** all spacing is a multiple of 4dp (`DESIGN.md`, Layout). |
| NFR-5 | **Typography:** Inter, 16px minimum for primary task content (`DESIGN.md` calls this out explicitly for accessibility). |
| NFR-6 | **Theme:** light and dark. `app.json` already sets `userInterfaceStyle: "automatic"`, and every screen carries `dark:` variants. |
| NFR-7 | **Perceived latency:** task completion toggles optimistically; the network round-trip must not gate the checkbox animation. |
| NFR-8 | **Auth security:** passwords hashed with bcrypt (cost >= 12); JWTs never in `AsyncStorage` — `expo-secure-store` only. |
| NFR-9 | **API latency:** dashboard summary and task list p95 under 300ms on a warm connection. Indexed queries only; no in-memory filtering of whole collections. |
| NFR-10 | **Offline:** read-only cache tolerance. Cached lists render when offline; mutations surface a clear error. Full offline sync is out of scope for v1. |
| NFR-11 | **Timezones:** all timestamps stored UTC; day-bucketing (today / upcoming / overdue) computed in the **user's** timezone, which the client sends. |

---

## 5. Out of scope for v1

Nothing in the 7 screens supports any of these, so they are excluded until asked for:

- Sharing, assignment, teams, comments, mentions
- Subtasks — *note:* the delete dialog copy says *"All associated subtasks will also be
  removed"*, but no screen creates or displays a subtask. Treated as speculative copy. See gap G5.
- Attachments and file uploads
- Push notifications and reminders (no notification settings screen designed)
- Tags or labels separate from categories
- Search (no search input on any designed screen)
- Calendar, week, or month views
- Social or OAuth sign-in (no Google/Apple buttons on either auth screen)
- Web app — the mobile repo can build for web, but no web layout is a requirement.
  *Note:* `task_categories` does contain a `md:` desktop nav variant. Ignored for v1.

---

## 6. Release scope

**v1 (must ship):** FR-1 (except FR-1.5 forgot-password, which ships as a stub screen),
FR-2, FR-3, FR-4, FR-6, the Tasks list screen from gap G1, and the **FR-5 voice UI**.

**Owner-supplied, outside this codebase:** the FR-5 speech recognition engine.

FR-5 was originally scheduled as a v1.1 fast-follow because its technical approach was
unresolved and the likely answer broke Expo Go. Neither is true any more: the UI is built
against an interface with a pure-JavaScript mock, so **Expo Go keeps working through all of
v1**, and the part that carried the risk is being handled separately.

---

## 7. Gaps in the design — decisions taken

These are places where the screens are incomplete or self-contradictory. Each has a
default so development is never blocked; each is also in `ai/OPEN_QUESTIONS.md` for the
product owner to confirm or overrule.

| ID | Gap | Default taken |
| -- | --- | ------------- |
| **G1** | **The Tasks tab has no design**, yet both main screens render it in the bottom nav. | Build it by reusing the Dashboard's card and section components: all tasks grouped by date section (Overdue, Today, Tomorrow, This Week, Later, Completed), with a category filter chip row at the top. This is also the destination for FR-2.6 category filtering. |
| **G2** | **Priority is displayed but never entered.** `task_details` shows a "High Priority" badge; `create_task` has no priority control. | Model `priority: low\|medium\|high`, default `medium`. Add a 3-option segmented control to Create/Edit Task. Render the badge only when `high`. |
| **G3** | **No Edit Task screen.** `task_details` has a pencil icon with no target. | Reuse the Create Task screen in edit mode: prefilled, header title "Edit Task", mic button hidden. |
| **G4** | **The hamburger menu on `task_categories` has no target.** | Route it to a Profile/Settings screen: avatar, name, email, theme preference (system/light/dark), Sign Out. This also gives the FR-1.8 avatar a destination. |
| **G5** | **The delete dialog mentions "subtasks"**, which no screen supports. | Prototype copy artefact. Reword to *"This action is permanent and cannot be undone."* Do not build subtasks. |
| **G6** | **Reschedule has no UI.** `task_details` has the button; no date picker is designed. | Open the platform date+time picker prefilled with the current due date, then call `POST /tasks/:id/reschedule`. |
| **G7** | **Recurrence semantics are undefined.** The design offers Daily/Weekly/Monthly but never shows what completing a recurring task does. | On completion of a recurring task, close out the current occurrence and create the next one from the recurrence rule. Detail in `ai/DATA_MODEL.md`, Recurrence section. |
| **G8** | **"Late Completion" thresholds are undefined** — is one minute late "late"? | Late if `completedAt` falls on a **calendar day after** the due date in the user's timezone. Days late = whole calendar days between them. This avoids ever rendering "0 days past deadline". |
| **G9** | **No empty states designed** for any list. | Every list needs one: icon, one-line explanation, primary action. Copy is specified in the mobile repo's `ai/SCREEN_ANALYSIS.md`. |
| **G10** | **No error or loading states designed.** | Skeleton placeholders matching card geometry for loading; an inline retry banner for errors. Never a bare spinner over a populated screen. |
| **G11** | **The Terms and Conditions link has no target.** | Static in-app screen with placeholder copy; the real content is the owner's to supply. |
| **G12** | **`task_details` shows a "Completed" badge next to "High Priority"**, so status is a badge too. | Render status badges for `completed` and `overdue`; render nothing for a normal pending task. |
