---
name: execution
description: >
  Drives the feature-by-feature implementation phase after the engineering plan is approved.
  Use this skill when the user has approved docs/engineering/engineering-doc.md and
  docs/engineering/implementation-specs.md and wants to begin building. Also trigger when
  the user says "start building", "implement the features", "let's build it", "start Stage 3",
  "implement from the specs", or "begin execution". Never use this skill before both engineering
  documents exist and are approved — the specs are the source of truth for everything built here.
---

## Prerequisites

Before execution begins, verify all three of the following exist:

| File | Purpose |
|---|---|
| `docs/engineering/engineering-doc.md` | Architecture, folder structure, naming conventions, DB design |
| `docs/engineering/implementation-specs.md` | Per-feature specs — the authoritative build reference |
| `docs/design-system.md` | Colors, spacing, typography, components — every UI element must use this |

If any file is missing, stop and tell the user which file is missing and which skill generates it. Do not begin building.

---

## Execution Rules (Non-Negotiable)

- Build **one feature at a time**, in the order defined in `implementation-specs.md`
- **State what you are about to build and list every file that will be created or modified — then wait for user confirmation** before writing a single line of code
- **Never advance to the next feature without the user explicitly approving** the current one
- TypeScript throughout — no `any`, no untyped values, no implicit types
- Production-ready code only — no `TODO`, no `// implement later`, no stub functions that return hardcoded data
- Implement **loading, error, and empty states** for every async operation — never leave a state unhandled
- Every UI element must use `docs/design-system.md` — no ad-hoc hex codes, no inline font sizes, no one-off spacing values
- Components must be reusable; logic must be modular — no monolithic files
- No defensive error handling for impossible cases — trust framework guarantees and internal code
- No comments explaining what the code does — only comments for non-obvious constraints or workarounds

---

## Pre-Execution Checklist

Run through this once before starting the first feature:

- [ ] Read `docs/engineering/engineering-doc.md` fully — understand the folder structure, naming conventions, and DB schema
- [ ] Read `docs/engineering/implementation-specs.md` fully — understand the feature sequence and dependencies
- [ ] Confirm the project scaffold exists (run `ls` on the project root to verify the framework is set up)
- [ ] Confirm the database schema is applied (ask the user if `database.sql` has been run)
- [ ] Confirm environment variables are set (check `.env.example` exists; ask user if `.env.local` is populated)
- [ ] Note which feature is first in the spec — that is Feature 1

If any checklist item fails, surface it to the user before proceeding.

---

## Per-Feature Execution Process

Repeat these steps for every feature, in spec order:

### Step 1 — Announce

State clearly:
- Which feature is being built (use the exact feature name from the spec)
- The spec section you are reading from
- Every file that will be **created** (list with full path)
- Every file that will be **modified** (list with full path + what changes)
- Any database operations needed before coding begins

**Wait for user confirmation.** Do not write code until the user says to proceed.

---

### Step 2 — Database First

Before writing any frontend or API code, apply all database operations for this feature:

1. Run every SQL statement from the spec's **DB Tasks** section
2. Verify the table exists by checking the spec's **DB Schema** section matches what was created
3. If a migration is needed (column added to an existing table), use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

Do not proceed to Step 3 if database setup is incomplete.

---

### Step 3 — Backend / API Routes

Build the API layer before the UI:

1. Create each route defined in the spec's **API Routes** section
2. Every route must include:
   - Input validation (reject malformed requests at the boundary)
   - Auth check (if the spec says auth required)
   - Correct HTTP status codes for every response case listed in the spec
   - Error responses that match the spec exactly — no extra fields, no missing fields
3. DB helper functions go in `lib/db/` (or the path defined in the engineering doc's folder structure)
4. No business logic in route handlers — extract to service functions

---

### Step 4 — State Management

Set up the state layer before building the component:

1. Identify the owner component from the spec's **State Management** section
2. Declare all state variables with their exact types and initial values as specified
3. Wire up the callbacks the spec defines (onDismiss, onSuccess, etc.)
4. Conditional rendering logic goes in the parent, not the child component

---

### Step 5 — Component

Build the UI component:

1. File path and component name must match the spec's **Component** section exactly
2. Props must match the spec exactly — no extra props, no missing required props
3. Implement all states in this order: loading → error → empty → populated
4. Confirm state appearance matches the spec's **Design** section
5. Submit button disabled/enabled logic must match the spec exactly
6. No hardcoded strings visible to the user — use constants or i18n keys

---

### Step 6 — Edge Cases

Before marking the feature done, verify every edge case from the spec's **Edge Cases** section is handled:

- [ ] User dismisses / navigates away without completing
- [ ] Duplicate submission
- [ ] Required field left empty
- [ ] Network error on submit
- [ ] Permission denied
- [ ] Data not found
- [ ] All feature-specific cases listed in the spec

Each case must produce the correct UI state (error message, empty state, redirect) — not a crash or a silent failure.

---

### Step 7 — Definition of Done

A feature is done when all of the following are true:

| Check | Criteria |
|---|---|
| Types | No TypeScript errors — `tsc --noEmit` passes |
| States | Loading, error, empty, and populated states all render correctly |
| Edge cases | Every case in the spec is handled |
| Design system | No ad-hoc styles — every value comes from `docs/design-system.md` |
| API contract | Request/response shapes match the spec exactly |
| DB schema | Tables, constraints, and indexes match the spec's DB Schema section |
| Naming | Files, components, functions, and variables follow the conventions in `engineering-doc.md` |
| No stubs | No TODO comments, no placeholder return values, no unimplemented functions |

**Report completion** to the user: state which feature is done and ask which feature to build next (or confirm the next one in sequence).

---

## Handling Blockers

If you encounter a conflict between the spec and reality (a third-party API changed, the DB schema has a conflict, a design decision is underspecified):

1. **Stop immediately** — do not improvise a solution
2. State the exact conflict: what the spec says vs. what you found
3. Propose one concrete resolution
4. Wait for user approval before continuing

Do not proceed past a blocker by making an assumption. Unreviewed assumptions in production code are bugs waiting to happen.

---

## Progress Tracking

After each feature is confirmed done:

- Update the feature's status in `docs/engineering/implementation-specs.md` from `To Do` → `Done` (if a status column exists)
- State how many features remain and what the next feature is
- If this was the last feature, proceed to the completion checklist below

---

## Admin Workflow Execution

If the product has an admin dashboard (defined in the PRD or engineering doc), treat it as a **separate feature group** that runs after all user-facing features are complete. Follow the same per-feature steps above, but apply these additional rules:

### Admin-Specific Build Order

Build admin features in this fixed sequence — each step depends on the previous:

1. **Admin role & auth gate** — role column/table, server-side route guard (`/admin/*` redirects non-admins to `/login`), admin session timeout (30 min idle)
2. **`system_config` table** — the data layer every admin panel reads from; must exist before any panel is built
3. **`admin_audit_log` table** — append-only; every write action in the admin UI logs here; build before any write panel
4. **Overview strip** — KPI tiles; read-only aggregation queries; confirm all source tables exist before building
5. **User analytics panel** — reads from `auth.users` and aggregated session data; read-only
6. **AI cost monitor + cost explainer** — reads from `ai_usage_logs`; the cost explainer formula must re-render live when token rates change
7. **Pricing & budget configuration panel** — first write panel in admin; writes to `system_config`; requires confirmation dialogs on every mutation and audit log entries
8. **Model configuration panel** — reads and writes active model settings from `system_config`; includes "Pause AI" toggle that queues jobs
9. **AI performance monitoring panel** — reads from `ai_usage_logs` and `key_terms`; correction rate alert banner at 12% threshold
10. **User feedback panel** — reads from `user_feedback`; includes triage status write (`admin_status` column)
11. **System health panel** — read-only; queue depth, error log, uptime
12. **Operational KPIs panel** — read-only aggregations
13. **Audit log panel** — read-only; non-deletable from UI

### Admin Build Rules

- **Route isolation:** Every admin route handler must check `role = 'admin'` server-side. A middleware check at the layout level is not sufficient — each individual route must verify the role independently.
- **Read from views, not raw tables:** Admin aggregate queries (user counts, cost totals, correction rates) must use SQL views or materialised queries — not ad-hoc joins in route handlers. Define the views in `database.sql`.
- **No user data in admin UI:** Admin panels show aggregated metrics only. No panel may display individual user contracts, chat history, or uploaded file content.
- **Every write panel needs three things before it is done:** (1) confirmation dialog, (2) success/error feedback to the admin, (3) an entry written to `admin_audit_log`.
- **Budget enforcement is backend, not frontend:** The 100% budget ceiling check and per-user plan limit check must be enforced in the API route — not in client-side state. The client may show the limit, but the server must block the action.
- **Margin simulator is derived, never stored:** The margin calculator in the pricing panel is computed from live `system_config` values on every render. It is never saved to the database — it is a display-only calculation.
- **The cost explainer must use the same formula as the backend cost logger.** If `ai_usage_logs.cost_usd` is calculated as `(prompt_tokens * input_rate) + (completion_tokens * output_rate)`, the explainer must show this identical formula. Any divergence between the display and the actual billing is a trust-breaking bug.

### Admin Definition of Done

In addition to the standard Definition of Done checklist, admin features must also pass:

| Check | Criteria |
|---|---|
| Role enforcement | Hitting `/admin/*` as a non-admin returns a redirect — verified with a test account |
| Audit completeness | Every mutation in panels 7, 8, 10 produces a row in `admin_audit_log` — verified by inspection |
| Budget gate | Setting budget ceiling to $0.01 and triggering an analysis queues the job, not fails it |
| Plan limit gate | Hitting a plan's contract limit blocks the upload route with a `402` — verified via API call |
| Cost formula parity | The explainer in Panel 3 and the `compute_cost()` function used by `ai_usage_logs` use the identical formula |

---

## Completion Checklist (all features done)

When every feature in the spec is implemented:

- [ ] `tsc --noEmit` passes with zero errors
- [ ] All routes return the correct status codes on the happy path
- [ ] All routes return the correct error codes for every failure case
- [ ] All loading, error, and empty states are tested manually (or via tests)
- [ ] No `console.log` statements left in production code
- [ ] `.env.example` is up to date with all environment variables used
- [ ] `docs/engineering/implementation-specs.md` statuses are all `Done`

After this checklist passes, tell the user: "All features are implemented. The next stage is the security review — run `/security-review` to begin."
