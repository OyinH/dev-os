# ContractIQ — Implementation Specs

**Status:** Draft for review (Stage 1 of Build Workflow)
**Companion to:** `docs/engineering/engineering-doc.md` (read that first — this document assumes its architecture decisions, schema, and API contracts as given and does not re-derive them)

> One detailed spec block per feature: user flow, DB schema touched, DB tasks, API routes, state management, component spec, design, edge cases. This is a design-level spec — Stage 2 (`/implementation-specs`) expands these into granular, runnable spec files under `docs/specs/`, plus `supabase-schema.sql` and `.env.example`.

Feature blocks map to the PRD's Component breakdown (§3, "Breaking the Agentic Workflow into Components," Components A–H) plus one additional block (I) for inline editing, which the PRD treats as its own user story (US-009) distinct from initial display.

---

## A. User Authentication & Session Management

**Maps to:** US-001, FR-01

### User Flow

1. Visitor clicks "Get Started Free" → sign-up form (email + password)
2. `supabase.auth.signUp()` creates the account; verification email sent
3. User verifies email → session established → redirect to `/dashboard`
4. Returning user: `supabase.auth.signInWithPassword()` → redirect to `/dashboard` on success, inline error on failure
5. Sign-out: `supabase.auth.signOut()` → redirect to landing page
6. Any request to an `(app)` route without a valid session is redirected to `/sign-in` by `middleware.ts`

### DB Schema

No custom tables — uses Supabase-managed `auth.users`. Every other table's `user_id` FK references `auth.users(id) on delete cascade`, so deleting an auth user cascades through the entire schema (contracts, key terms, chat, feedback).

### DB Tasks

- None beyond what Supabase Auth manages automatically
- No custom trigger needed at MVP (no profile table — email is the only identity attribute the app needs)

### API Routes

None — auth is handled entirely client-side via `supabase-js`, no Edge Function required. `app/auth/callback/route.ts` is a thin Next.js Route Handler (not an Edge Function) that exchanges the verification code for a session, since it must run in the browser's redirect chain before any Supabase Edge Function context exists.

### State Management

- No TanStack Query — session state comes from `supabase-js`'s own client (`onAuthStateChange` listener in root layout)
- No Zustand — auth state is not app UI state

### Component Spec

- `SignUpForm` / `SignInForm` — email + password inputs (shadcn `Input`), submit button with loading state, inline `Alert` for errors
- `middleware.ts` — session refresh + route protection for `(app)` group

### Design

Standard auth form layout per `docs/design.md`: centered card (radius 8px), Blue 500 primary button, Grey 500 helper text, Red 500 inline error text with Red 50 background tint.

### Edge Cases

- Invalid credentials → clear inline error, no generic "something went wrong"
- Duplicate email sign-up → Supabase Auth's built-in error surfaced verbatim (rephrased for clarity: "An account with this email already exists")
- Unverified email attempts sign-in → prompt to resend verification
- Session expires mid-session (e.g., long-open results page) → next mutation call fails with `401`, client redirects to `/sign-in` preserving the return URL
- Auth flow must complete ≤10s (PRD constraint) — no artificial delays in the sign-up/sign-in path

---

## B. PDF Upload & Text Extraction

**Maps to:** US-002 (upload portion), FR-02, FR-03

### User Flow

1. User selects contract type (NDA/MSA dropdown) on `/upload`
2. Drags/drops or file-picks a PDF
3. Client-side pre-validation: file type, size ≤10MB
4. `upload-extract-text` Edge Function invoked: parses PDF text with `[PAGE N]` markers, validates page count/word count/token count server-side, writes `contracts` row (`status='processing'`), uploads raw PDF bytes to Storage (non-blocking)
5. Pre-processing preview renders immediately from a client-side constant list (`NDA_TERMS`/`MSA_TERMS`) — no round trip needed for this step
6. On success, wizard advances to custom-term step (see Block D)

### DB Schema

`contracts` table (see `engineering-doc.md` §7) — this feature is responsible for the `insert` that creates the row and populates `contract_text`, `page_count`, `token_count`, `file_path` (nullable), `status`.

### DB Tasks

- `insert into contracts (user_id, title, contract_type, contract_text, page_count, token_count, file_path, status) values (...)`
- On Storage upload failure: `file_path` stays `null`, contract processing continues unaffected (text viewer fallback covers display — see Block E)

### API Routes

**`upload-extract-text`** (Edge Function)
- Auth: required
- Request: `multipart/form-data` (PDF bytes, `contract_type`, `filename`)
- Response: `{ contract_id, status: 'processing', page_count, token_count, storage_warning?: string }`
- Errors: `413` oversized file, `422` scanned/unsupported PDF (extracted text <100 words), `422` page count >20, `422` token count > ~15,000

### State Management

- Zustand `uploadWizardStore`: `step`, `contractType`, `selectedFile`
- TanStack `useMutation` for the upload call; on success, seed `['contract', contract_id]` and invalidate `['contracts']`

### Component Spec

- `UploadWizard` (container, step from Zustand)
- `ContractTypeSelect` (shadcn `Select`)
- `FileDropzone` (drag/drop + file-pick, client-side validation feedback)
- `TermPreviewList` (renders standard term names for the selected type — no data yet, just labels)
- `ProcessingProgress` (shadcn `Progress`, 3-step: extracting text → analyzing → compiling — steps 2/3 activate in Block C)

### Design

Dropzone: dashed border Grey 200, Grey 25 background, Blue 500 border + Blue 50 background on drag-over (per `docs/design.md` interaction states). Term preview list uses the "Data Label Pair" pattern (16px Medium label / 12px Regular sub-value).

### Edge Cases

- File >10MB → rejected client-side before upload starts, clear error message
- Non-PDF file → rejected client-side (MIME + extension check), re-validated server-side (never trust client-only validation)
- PDF >20 pages → rejected server-side after parsing (page count only known post-extraction)
- Scanned/image PDF (extracted text <100 words) → "Scanned PDFs are not supported yet" error, contract creation rolled back or marked `error` (not left in `processing` limbo)
- Token count exceeds ~15,000 → rejected with "This contract is too long for the current version — contact support for longer-document support"
- Storage upload fails but text extraction succeeds → `file_path = null`, `status` still proceeds to `processing`→`completed` normally; results page falls back to `TextViewerFallback` (Block E); this must never block the AI pipeline
- Corrupted/unparseable PDF → caught, contract not created (or created then immediately `error`), user sees a clear retry-upload message (distinct from the scanned-PDF message)
- User navigates away mid-upload → in-flight request is not cancelled server-side (Edge Function completes independently); client shows the contract in `processing` state if user returns to dashboard

---

## C. Key Term Extraction via OpenAI

**Maps to:** US-002 (extraction portion), US-003, US-004, FR-04, FR-11

### User Flow

1. User clicks "Process Contract" after reviewing the term preview (and optionally adding custom terms — Block D)
2. `process-contract` Edge Function builds the few-shot prompt (standard terms for the contract type + any custom terms), calls GPT-4o (temp 0.1, JSON mode)
3. Response parsed: `detected_contract_type` compared against user-selected `contract_type` (soft mismatch warning if different); each term's confidence normalized from `0.0–1.0` to `0–100`
4. Results written to `key_terms` / `custom_key_terms`; `contracts.status` set to `completed`
5. User redirected to results page; terms render colour-coded by confidence

### DB Schema

`key_terms`, `custom_key_terms` (full schema in `engineering-doc.md` §7). `contracts.status`, `contracts.detected_contract_type`, `contracts.processing_completed_at` updated by this feature.

### DB Tasks

- `insert into key_terms (contract_id, term_name, value, page_number, confidence_score, source_sentence, display_order)` — one row per standard term returned
- `insert into custom_key_terms (...)` for any custom terms bundled into the same call (see Block D)
- `update contracts set status='completed', detected_contract_type=…, processing_completed_at=now()` on success
- `update contracts set status='error', error_message=…` on exhausted retries

### API Routes

**`process-contract`** (Edge Function)
- Auth: required
- Request: `{ contract_id, contract_type, custom_terms?: string[] (≤5) }`
- Response: `{ status, detected_contract_type, key_terms: [...], custom_key_terms: [...] }`
- Errors: `502` after 3 retries with exponential backoff, `422` invalid custom term count
- Internal retry: on JSON parse failure, one automatic re-prompt ("Your previous response was not valid JSON...") before surfacing an error

### State Management

- TanStack `useMutation`; on success invalidate `['contract', id]`, `['key-terms', id]`, `['contracts']`
- `ProcessingProgress` (Zustand-driven step indicator) advances through extracting → analyzing → compiling as the mutation progresses (optimistic UI staging, since the Edge Function itself is a single call — steps are client-simulated with the real network call as step 2)

### Component Spec

- `KeyTermsPanel` / `KeyTermList` / `KeyTermCard` (full tree in `engineering-doc.md` §5)
- `ConfidenceBadge` — colour logic: green (`#13A10E`/Green 50 bg) ≥80, amber (`#FFAA33`/Yellow 50 bg) 50–79, red (`#D13438`/Red 50 bg) <50
- `LowConfidenceWarning` — non-dismissible `Tooltip`, shown only <50%
- `ContractTypeMismatchBanner` — shown when `detected_contract_type !== contract_type`

### Design

Confidence badge: 4px radius pill, `Semantic Status Badge` pattern from `docs/design.md` (`background: [Color] 50; border: 1px solid [Color] 200; text: [Color] 700`). Term cards: 8px radius, White background, Grey 100 border, 16px internal padding.

### Edge Cases

- OpenAI timeout/5xx → 3-attempt exponential backoff, then `status='error'` with retry CTA (no re-upload)
- JSON parse failure → single automatic retry prompt before erroring
- Model returns fewer terms than expected (e.g. omits a standard term) → term simply absent from the panel; do not synthesize a placeholder row (a missing term is itself informative — the "Why?" section has nothing to show, which is preferable to fabricating one)
- All terms return very low confidence (non-contract document uploaded) → every term shows the red warning; no special-cased "this isn't a contract" detection at MVP, confidence warnings are the mitigation
- `detected_contract_type` differs from user selection → soft warning banner shown, extraction still proceeds and displays (graceful degradation per PRD Internal Risks table, not a hard block)
- Cost tracking: `token_count` stored per contract enables monthly cost-vs-budget monitoring (§8 of engineering doc) — not a per-request blocking check at MVP, since a single contract is capped at ~15k input tokens by upload validation already

---

## D. Custom Key Term Addition

**Maps to:** US-005, FR-05

### User Flow

1. During the pre-processing preview step, user clicks "+ Add Key Term"
2. Types a custom term name (e.g., "Non-compete radius")
3. Term appears in the preview list with a "Custom" badge
4. Up to 5 custom terms allowed; the "+ Add Key Term" control disables/hides past the 5th
5. On "Process Contract," custom term names are bundled into the same `process-contract` call as the standard extraction (Block C) — not a separate API call

### DB Schema

`custom_key_terms` (see `engineering-doc.md` §7), including the `enforce_custom_term_limit` trigger.

### DB Tasks

- `insert into custom_key_terms (contract_id, term_name, is_manual=true, ...)` — happens as part of `process-contract`'s write, after extraction returns values for the custom terms
- Trigger `enforce_custom_term_limit` (before insert) rejects any insert past 5 rows for a given `contract_id`, as a server-side backstop independent of client-side limiting

### API Routes

No dedicated endpoint — custom term names travel as part of the `process-contract` request payload (`custom_terms: string[]`, Block C). This avoids a second OpenAI call, per PRD §8's prompt strategy ("Custom terms are appended to the standard term list passed to the model").

### State Management

- Zustand `uploadWizardStore.customTerms: string[]` (≤5) — pure client state until `process-contract` is called
- No separate query key; results land in the same `['key-terms', id]` query as standard terms (Block C)

### Component Spec

- `CustomTermInput` — text input + "Add" button, inline validation (non-empty, ≤100 chars, no duplicate names)
- `CustomTermBadge` — small tag on `TermPreviewList` rows and later on `KeyTermCard` rows where `is_manual = true`

### Design

"Custom" badge: Violet family (accent, per `docs/design.md`'s "Color families for status" rule — Violet=accent, distinct from the Green/Red/Yellow confidence semantics so the two badge types are never visually confused), 4px radius tag.

### Edge Cases

- 6th custom term attempted → input disabled client-side; if bypassed (direct API call), DB trigger rejects the insert and `process-contract` returns `422`
- Empty or whitespace-only term name → rejected client-side before it's added to the list
- Duplicate custom term name (case-insensitive match against another custom term, or against a standard term for that contract type) → rejected with inline message, avoids ambiguous duplicate rows in the results panel
- Custom term yields low/no confidence (clause doesn't exist in this contract) → same treatment as a low-confidence standard term (red badge, non-dismissible warning) — not silently dropped
- User removes a custom term before processing → simply removed from the Zustand array, no DB interaction has happened yet at that point

---

## E. Results Display (PDF Viewer + Key Terms Panel)

**Maps to:** US-003, US-004, US-006, FR-04, FR-06, FR-07, FR-11

### User Flow

1. Results page loads: two-panel layout (`ResizablePanelGroup`) — contract content left, key terms right
2. `ContractContentViewer` picks `PdfViewer` if a valid signed URL resolves for `file_path`; falls back to `TextViewerFallback` (parses `[PAGE N]` markers from `contract_text`) otherwise
3. User scrolls/zooms the PDF; clicks a key term's page reference → viewer scrolls to that page and highlights the nearest matching span (via `source_sentence` substring search, page-border fallback if no exact match)
4. User expands "Why?" on any term to see the verbatim `source_sentence`
5. Disclaimer banner ("Not legal advice") is always visible on this page

### DB Schema

Reads `contracts` (`file_path`, `contract_text`, `page_count`), `key_terms`, `custom_key_terms` — no writes from this feature beyond the `touch_contract_access` RPC (updates `last_accessed_at`).

### DB Tasks

- `touch_contract_access(contract_id)` RPC called once on page mount (fire-and-forget) — drives the 90-day retention window, not user-visible

### API Routes

No dedicated Edge Function for display itself — data is fetched via RLS-scoped `supabase-js` reads (`['contract', id]`, `['key-terms', id]`) and a Supabase Storage `createSignedUrl()` call (`['signed-url', id]`, 1-hour expiry).

### State Management

- TanStack Query: `['contract', id]`, `['key-terms', id]`, `['signed-url', id]` (`staleTime` just under 1hr, refetch-on-403 handler)
- Zustand `panelUiStore`: `targetPage`, `viewerZoom`

### Component Spec

Full tree in `engineering-doc.md` §5:
- `ContractContentViewer` → `PdfViewer` (PDF.js) or `TextViewerFallback`, both respond to `targetPage`
- `PdfToolbar` (zoom controls)
- `KeyTermsPanel` → `KeyTermList` → `KeyTermCard` → `ConfidenceBadge`, `PageRefButton`, `WhySection`, `LowConfidenceWarning`
- `DisclaimerBanner`

### Design

Two-panel `Resizable` split, default ~55/45. Page padding, section gaps, and card radii follow `docs/design.md` tokens throughout (see engineering-doc.md §5 token table). Mobile (<`md` breakpoint): panels collapse into `Tabs` ("Document" / "Key Terms") rather than a fixed split.

### Edge Cases

- Signed URL fails to resolve (Storage unavailable or `file_path` null from a failed upload) → `TextViewerFallback` renders automatically; user is never shown a broken/blank viewer
- Signed URL expires mid-session (>1hr review) → refetch-on-403 in `PdfViewer` requests a fresh URL transparently
- `source_sentence` substring search finds no exact match in the PDF text layer (whitespace/ligature drift) → falls back to page-level border highlight only, no crash or blank highlight state
- Multiple terms reference the same page → all render correctly in the terms panel; only page-level (not span-level) sync is guaranteed when several terms share a page, per the documented MVP scope limit
- Very large PDF (near 20-page/10MB ceiling) → PDF.js pages load lazily to avoid render-blocking the whole document at once
- Term references a `page_number` beyond `contracts.page_count` (extraction error) → `PageRefButton` disabled/no-ops rather than attempting an out-of-range scroll
- Reverse sync (scrolling the PDF auto-highlights a term) is explicitly **not implemented** — documented MVP scope exclusion, not a bug

---

## F. Contract Chat (Q&A)

**Maps to:** US-007, US-012, FR-08, FR-09

### User Flow

1. User opens `ChatSheet` via the floating `ChatFAB`
2. If reopening an existing contract, prior `chat_sessions`/`chat_messages` load automatically (persistence)
3. User types a question, sends — message optimistically appended, right-aligned
4. `chat-message` Edge Function creates a session if none exists, fetches full `contract_text` + full message history (≤200, ascending), classifies the query (`contract`/`history`/`both`) via keyword heuristic, calls GPT-4o (temp 0.4) with the document-only system prompt
5. Response appears left-aligned within 15s P95, prefixed "Based on the document…", with a mandatory `[Page X]` citation rendered as a clickable chip
6. Clicking the citation sets `targetPage`, scrolling the content viewer (Block E)

### DB Schema

`chat_sessions`, `chat_messages` (see `engineering-doc.md` §7).

### DB Tasks

- `insert into chat_sessions (contract_id, user_id)` — lazily, on first message only if no session exists yet (enforced unique on `contract_id`)
- `insert into chat_messages (session_id, role='user', content)` on send
- `insert into chat_messages (session_id, role='assistant', content, cited_pages, query_classification)` on model response

### API Routes

**`chat-message`** (Edge Function)
- Auth: required
- Request: `{ contract_id, session_id?, message }`
- Response: `{ message_id, role: 'assistant', content, cited_pages: number[], created_at }`
- Errors: `502` OpenAI failure (3-retry backoff, then user-facing error — chat failures do not corrupt `contracts.status`), `422` empty message

### State Management

- TanStack Query: `['chat-messages', sessionId]`, optimistic append on send, reconcile/rollback on failure
- Zustand `chatDraftStore`: unsent draft text per `contract_id`, survives navigating away and back within the session

### Component Spec

- `ChatFAB`, `ChatSheet`, `ChatMessageList` (virtualized), `ChatMessageBubble`, `PageCitationChip`, `ChatComposer`, `ChatEmptyState`

### Design

User messages: right-aligned, Blue 50 background bubble. Assistant messages: left-aligned, Grey 25 background bubble, Grey 900 text. Citation chip: small Blue 500 outlined pill, 4px radius, clickable.

### Edge Cases

- Contract still `processing` (extraction not complete) → chat entry point disabled/hidden until `status='completed'`, since there's no confirmed grounded content to chat against yet beyond raw text (raw `contract_text` technically exists at this point, but chat is gated on completed processing to keep the UX flow linear per PRD Flow 4, which starts from the Results Page)
- OpenAI timeout/failure on a chat call → 3-retry backoff, then inline error bubble with a "Try again" action on that specific message (does not affect `contracts.status`)
- Model response omits the mandatory `[Page X]` citation → treated as a malformed response, one retry with an explicit reminder of the citation requirement, matching the JSON-retry pattern used in extraction
- Question about a topic absent from the document → "I cannot find this in the document" is the correct, expected response — asserted directly by the automated hallucination regression test (`engineering-doc.md` §13)
- Message history approaches the 200-message cap → oldest messages are still stored (never deleted) but only the most recent 200 are sent as model context, per PRD Assumption 14's stated ceiling
- Empty/whitespace-only message → rejected client-side, `ChatComposer` submit disabled
- User sends a second message before the first response resolves → composer disabled while a request is in flight, preventing out-of-order optimistic messages

---

## G. Dashboard & History

**Maps to:** US-008, FR-10

### User Flow

1. User lands on `/dashboard` after sign-in
2. Summary card shows total contracts processed, breakdown by type (NDA/MSA), last 5 contracts with status/date
3. Full sortable list (by date, name, type) available below/alongside the summary
4. Clicking any row opens `/contracts/[contractId]` (Block E)
5. Empty state ("No contracts reviewed yet…") shown when the user has zero contracts

### DB Schema

Reads `contracts` only — `user_id`, `title`, `contract_type`, `status`, `created_at`. No new tables.

### DB Tasks

None beyond the standard RLS-scoped `select`. No dedicated aggregation table at MVP — summary counts are computed client-side or via a lightweight `select count(*) ... group by contract_type` query, acceptable at expected MVP scale (≤200 contracts per PRD Assumption 4).

### API Routes

No Edge Function — direct RLS-scoped `supabase-js` reads via TanStack `useQuery(['contracts'])`, sorted/filtered client-side or via query parameters. (Justification: a pure read with no OpenAI/orchestration involvement doesn't benefit from Edge Function cold-start latency, per `engineering-doc.md` §9.)

### State Management

- TanStack Query `['contracts']` — invalidated by upload, process, delete mutations from other features
- Local component state (not Zustand) for sort column/direction — ephemeral, page-scoped, doesn't need to survive navigation

### Component Spec

- `SummaryCards` (total, by-type counts)
- `ContractListTable` (sortable columns: name, type, date, status), status rendered as a small colored tag (`processing`=Grey, `completed`=Green, `error`=Red)
- Empty state block (illustration/copy + "Upload your first contract" CTA)

### Design

Table rows: White background, Grey 100 dividers, Grey 50 hover state (per `docs/design.md` interaction states table). Status tags use the same `Semantic Status Badge` pattern as confidence badges, with Grey/Green/Red mapped to processing/completed/error respectively.

### Edge Cases

- Zero contracts → empty state, not an empty table with headers
- A contract in `error` status appears in the list with a Red status tag and, on click, opens the results page in a retry-affordance state rather than a broken results view
- Very long contract titles (long filenames) → truncated with ellipsis + full title on hover/tooltip
- Sorting a large list (approaching the ~200-contract free-tier ceiling) → client-side sort is acceptable at this scale; no pagination required at MVP per PRD Assumption 4
- Deleting a contract elsewhere (Block E's delete action, if surfaced) removes it from this list via `['contracts']` invalidation — no stale row lingers

---

## H. Feedback Collection

**Maps to:** US-010, FR-12 *(P2 — Phase 2, included here for completeness since it shares infrastructure with the MVP results page)*

### User Flow

1. On the results page, user clicks thumbs up or thumbs down
2. Optional comment field (`Popover` with `Textarea`) appears
3. Submission saved to `user_feedback`, tied to `contract_id` + `user_id`
4. Resubmitting (changing rating) upserts the existing row rather than creating a duplicate

### DB Schema

`user_feedback` (see `engineering-doc.md` §7), unique on `(contract_id, user_id)`.

### DB Tasks

- `insert into user_feedback (contract_id, user_id, rating, comment) on conflict (contract_id, user_id) do update set rating=…, comment=…, created_at=now()`

### API Routes

**`submit-feedback`** (Edge Function)
- Auth: required
- Request: `{ contract_id, rating: 'up'|'down', comment?: string }`
- Response: feedback row
- Errors: `403` if not the contract owner (RLS)

### State Management

- TanStack `useMutation` → `setQueryData(['feedback', contract_id], response)` directly (no need to invalidate/refetch, the response is the full state)

### Component Spec

- `FeedbackWidget` — toggle-style thumbs up/down buttons (shadcn `Button` group), `Popover` + `Textarea` for the optional comment, confirmation toast on submit

### Design

Thumbs buttons: outlined by default, filled Green 500 (up) / Red 500 (down) when selected, per the same status-color families used elsewhere.

### Edge Cases

- Resubmitting feedback on the same contract → upsert, not a duplicate row (enforced by the unique constraint)
- Comment submitted without a rating → rating is required first; comment field only appears after a thumbs selection
- Contract deleted after feedback was given → `user_feedback` row cascades away with it, no orphaned record
- Very long comment text → soft client-side length guidance (no hard PRD-specified limit; a generous cap, e.g. 1000 chars, prevents abuse without being restrictive)

---

## I. Inline Key Term Editing

**Maps to:** US-009, FR (implied by US-009, correction feedback loop referenced throughout PRD §8/§9/§10)

### User Flow

1. User clicks a term's value on the results page
2. `TermValueEditable` switches to an editable input inline
3. On save (blur or Enter), `edit-key-term` is called optimistically
4. Term updates immediately in the UI with an "Edited" badge; on failure, the UI rolls back and shows a toast

### DB Schema

`key_terms` / `custom_key_terms` — `value`, `is_edited`, `original_ai_value`, `edited_at` columns; plus the `term_corrections` audit table populated by an `after update` trigger (see `engineering-doc.md` §7).

### DB Tasks

- `update key_terms set value=$new, is_edited=true, original_ai_value=coalesce(original_ai_value, value), edited_at=now() where id=$term_id`
- Trigger `log_term_correction` fires on this update, writing to `term_corrections` for the feedback-improvement loop and the >12%/7-day correction-rate alert

### API Routes

**`edit-key-term`** (Edge Function)
- Auth: required
- Request: `{ contract_id, term_id, term_table: 'key_terms'|'custom_key_terms', new_value }`
- Response: `{ term_id, value, is_edited, original_ai_value }`
- Errors: `403` RLS denial, `404` term not found
- SLA: must resolve ≤2 seconds (PRD constraint)

### State Management

- Optimistic update directly on the `['key-terms', contract_id]` TanStack Query cache; rollback to previous cached value on mutation error

### Component Spec

- `TermValueEditable` (display/edit toggle, shadcn `Input` in edit mode)
- "Edited" badge (small Blue-outlined tag, distinct from the Violet "Custom" tag from Block D so the two edit states are never visually confused)

### Edge Cases

- Save fails (network/RLS) → optimistic value rolled back, toast shown, original AI value untouched
- Edit to an empty value → allowed (user may be clearing an incorrect extraction pending manual lookup), but `original_ai_value` is still preserved for the correction log
- Second edit to an already-edited term → `original_ai_value` is NOT overwritten (only set "once, on first edit," per schema note in `engineering-doc.md` §7) — it always reflects the model's original output, not the previous edit
- Editing a term while `process-contract` for the same contract is somehow still in flight → not possible in practice, since the results page (and thus this component) only renders after `status='completed'`
- Rapid successive edits to the same term (e.g. typo-fix-typo-fix) → each save is a discrete optimistic mutation; last-write-wins, no debounce-related data loss since saves are keyed by the current input value at blur/Enter, not by keystroke

---

## Deferred (Phase 2 / Backlog) — Not Speced in Detail

**Export key terms to CSV/PDF (US-011, FR — P2/Backlog).** Requires a new Edge Function (not yet named/contracted) generating a downloadable file within 5s. Deferred to Stage 2 once Phase 1 is built and stable — no DB schema changes anticipated (reads existing `key_terms`/`custom_key_terms`), but the export-format design (CSV column order, PDF report layout) is out of scope for this Stage 1 document per `CLAUDE.md`'s stage gating.
