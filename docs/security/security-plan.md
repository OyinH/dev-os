# ContractIQ — Security Foundation Plan

**Status:** Complete (Stage 3 of Build Workflow)
**Depends on:** `docs/engineering/engineering-doc.md`, `docs/specs/*` (Stage 1–2, approved)
**Produced by:** `skills/security-foundation/SKILL.md`

> All security controls below are in place before any Stage 5 feature code is written, per `CLAUDE.md`'s stage gate.

---

## 1. A note on architecture — why this plan deviates from the generic skill template in a few places

`skills/security-foundation/SKILL.md` is written as a generic Next.js-API-routes template. This project's approved architecture (`engineering-doc.md` §6, "Why Edge Functions over Next.js Route Handlers") deliberately puts every OpenAI-heavy operation — `upload-extract-text`, `process-contract`, `chat-message` — inside **Supabase Edge Functions (Deno)**, specifically so `OPENAI_API_KEY` never touches Vercel or the Next.js server. That decision was locked in Stage 1 and is not renegotiated here.

Three concrete adaptations follow from that:

1. **File scope allowed = PDF only.** The skill's generic template allows `.pdf` and `.docx`. The approved PRD/specs scope is PDF-only for NDA/MSA contracts (`docs/specs/02-upload-extract-text-spec.md`). `.docx` is intentionally excluded from `lib/security/inputValidator.ts` — adding it would silently expand approved scope.
2. **Token/page/message limits use the project's real numbers, not the skill's generic defaults.** 20-page ceiling (not 200), ~15,000-token ceiling, 200-message chat history ceiling (not 100) — these come from `docs/ContractIQ_PRD.md` and `docs/specs/03`/`06`, which are the authoritative source over the skill's generic placeholders.
3. **Rate limiting, prompt-injection defense, token limits, and chat/contract ownership checks have their real runtime enforcement inside Supabase Edge Functions, not Next.js**, because that's where the actual OpenAI calls and contract mutations happen. The canonical TypeScript implementations live in `contractiq/lib/security/` (this stage's deliverable, per `CLAUDE.md`); Stage 5 must create Deno mirrors under `supabase/functions/_shared/security/` that enforce the identical rules — this is the same "duplicated by necessity across the Deno/Node runtime boundary" pattern already used for `NDA_TERMS`/`MSA_TERMS` in `docs/specs/13-standard-terms-and-constants-spec.md`. `promptInjectionGuard.ts` and `chatSecurity.ts` in particular have their real call site in the Deno `chat-message` function — the Next.js copies are the canonical reference and are ready for any future Next.js-side code that touches chat.

Two pieces of this plan run **entirely in Next.js** and are fully wired up today: server-side login/logout (so auth attempts can be rate-limited) and middleware-based route protection.

---

## 2. Security issues found and fixed

| # | Issue | Found in | Fix |
|---|---|---|---|
| 1 | Rate-limiting login attempts by `user_id` doesn't work — a wrong/unknown email has no `user_id` yet, and `rate_limit_events.user_id` was a `not null` FK to `auth.users`. | Initial `rate_limit_events` design (mirroring the skill's literal schema) | Replaced `user_id` with a generic `identifier` column (client IP for the pre-auth `auth` action, user UUID for already-authenticated actions). See `supabase/rls-policies.sql` §1. |
| 2 | `contractiq/lib/supabase/{client,server}.ts` were fully specified in `docs/specs/01-auth-spec.md` but never actually created as files — every piece of Stage 3 code that needs a Supabase client would have failed to import. | This stage's implementation | Created both files, plus `admin.ts` (service-role client, server-only) which didn't exist in any prior stage. |
| 3 | No `types/database.types.ts` existed — nothing using a typed Supabase client could compile. | This stage's implementation | Hand-written to match `docs/specs/supabase-schema.sql` + `supabase/rls-policies.sql`; header comment instructs regenerating via `supabase gen types typescript` once the project exists, and reconciling drift against this file. |
| 4 | `contractiq/package.json` had no `@supabase/ssr`, `@supabase/supabase-js`, or `zod` — every file in this stage depends on at least one of them. | This stage's implementation | Added all three; `npm install` and `npx tsc --noEmit` both verified clean (zero errors). |
| 5 | Generic `GenericTable`/`GenericView` types in the installed `@supabase/postgrest-js` (v2.110.6) require a `Relationships` field on every table/view; the first draft of `database.types.ts` omitted it, which silently degraded every `.from(...)` call to `never` (caught by `tsc`, not by runtime — would have shipped broken types). | This stage's implementation | Added `Relationships: []` to every table and view. This codebase never uses the embedded-resource `select('*, other(*))` syntax the field exists for — every spec fetches one table at a time and joins in application code — so an empty array is correct, not a placeholder. |

## 3. Files created

### `docs/security/` and `supabase/`

| File | Purpose |
|---|---|
| `docs/security/security-plan.md` | This document |
| `supabase/rls-policies.sql` | `rate_limit_events` table (service-role only, zero user-facing policies) + idempotent RLS-enable confirmation for every table from Stage 2's schema |

### `contractiq/lib/supabase/` (foundational — speced in Stage 1, created in this stage)

| File | Purpose |
|---|---|
| `client.ts` | Browser Supabase client |
| `server.ts` | Cookie-aware server client for Server Components / Route Handlers |
| `admin.ts` | Service-role client. **Server only.** Used exclusively by `rateLimiter.ts`. |

### `contractiq/lib/security/`

| File | Purpose |
|---|---|
| `authGuard.ts` | `requireAuth()` — verifies session in a Route Handler, returns the user or a ready-to-return `401` |
| `rateLimiter.ts` | Sliding-window rate limiting via `rate_limit_events`; real limits: auth 10/min, chat 30/min, contract processing 5/hr, contract upload 20/day |
| `tokenLimiter.ts` | File size (10MB), page count (20), token count (~15,000), chat message length (5000 chars), chat history ceiling (200, via `MAX_CHAT_HISTORY` env var) |
| `inputValidator.ts` | Zod schemas for every mutation request shape in `docs/specs/02–10`, plus `validateFileUpload()` (extension → MIME → size, PDF-only) |
| `promptInjectionGuard.ts` | `sanitizeForLLM()` — detects `ignore previous instructions`, `reveal system prompt`, `act as`, `jailbreak`, `DAN mode`, etc.; throws `PromptInjectionError` |
| `chatSecurity.ts` | `verifyContractOwnership()`, `verifySessionOwnership()`, `verifyContractReadyForChat()` — explicit ownership checks layered on top of RLS |

### `contractiq/app/api/auth/`

| File | Purpose |
|---|---|
| `login/route.ts` | Rate-limited (by IP), Zod-validated, server-side `signInWithPassword` |
| `logout/route.ts` | Auth-guarded, server-side `signOut` |

### `contractiq/middleware.ts`

Protects `/dashboard`, `/upload`, `/contracts`, `/settings` — redirects unauthenticated requests to `/sign-in?returnTo=<path>`. Redirects already-authenticated users away from `/sign-in`/`/sign-up` to `/dashboard`. Verified live: an unauthenticated request to `/dashboard` returns `307` → `location: /sign-in?returnTo=%2Fdashboard`.

**Note:** this uses the approved spec route names (`/sign-in`, `/sign-up`), not the scaffold's current `/login`, `/signup` folder names. See Outstanding Items below — this is a tracked Stage 5 dependency, not an oversight.

### `contractiq/next.config.mjs`

Response security headers, applied to every route via `headers()`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. Not in the original Stage 3 scope or the generic skill template — added post-hoc after a manual QA pass caught the gap. Verified live via `curl -sI http://localhost:3000/`.

### `contractiq/types/database.types.ts`

Full hand-written types for every table + the `v_correction_rate_7d` view + `touch_contract_access` RPC.

## 4. SQL to run in Supabase

Run in order, in the Supabase SQL Editor, on a fresh project:

1. `docs/specs/supabase-schema.sql` (Stage 2 — tables, RLS, triggers, storage bucket)
2. `supabase/rls-policies.sql` (this stage — `rate_limit_events` + RLS confirmation)

## 5. Environment variables added

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `.env.example`, `contractiq/.env.local(.example)` | Used to build Supabase Auth redirect URLs |
| `MAX_CHAT_HISTORY` | Same, default `200` | Configurable chat-context ceiling; **do not** lower to the skill's generic default of 100 without also updating `docs/specs/06-contract-chat-spec.md` |

`SUPABASE_SERVICE_ROLE_KEY`'s usage note in `.env.example` was updated to reflect its second legitimate consumer: `lib/supabase/admin.ts` (rate limiting), in addition to the existing `retention-cleanup` Edge Function.

## 6. Manual Supabase Dashboard checklist (not code — verify before launch)

- [ ] Email verification enabled (Authentication → Providers → Email)
- [ ] Password reset flow enabled — **note:** `docs/specs/01-auth-spec.md` §6 explicitly scoped password reset **out** of MVP; leave Supabase's default reset flow enabled at the platform level for account-recovery safety, but no in-app "Forgot password" UI is built at MVP
- [ ] Session length / refresh token rotation reviewed (Authentication → Sessions)
- [ ] `pg_cron` extension enabled (required by `docs/specs/supabase-schema.sql` §10's `retention-cleanup-daily` schedule)

## 7. Outstanding items — tracked for Stage 5

1. **Route naming mismatch.** `middleware.ts` protects/redirects to `/sign-in`, `/sign-up` per the specs, but the scaffolded folders are still `app/(auth)/login/`, `app/(auth)/signup/`, `app/(dashboard)/dashboard/`. Until Stage 5 renames these to `app/(auth)/sign-in/`, `app/(auth)/sign-up/`, `app/(app)/dashboard/`, visiting `/sign-in` will 404. This was explicitly deferred to Stage 5 (a folder rename is feature-implementation scope, not security-plumbing scope) — flagged here so it isn't silently forgotten.
2. **Deno mirrors required.** `supabase/functions/_shared/security/{rateLimiter,promptInjectionGuard,tokenLimiter,chatSecurity,inputValidator}.ts` must be created during Stage 5 alongside the actual Edge Functions (`upload-extract-text`, `process-contract`, `chat-message`, `edit-key-term`, `submit-feedback`, `delete-contract`), enforcing the identical rules defined in `contractiq/lib/security/`. This plan defines the rules; Stage 5 wires them into the runtime that actually executes them.
3. **Sign-up form** still needs to be updated to call the existing client-side `supabase.auth.signUp()` per `docs/specs/01-auth-spec.md` (unchanged by this stage — only login was moved server-side, since signup doesn't need rate-limit protection at the same severity and has no session-cookie timing requirement).

---

Security foundation is complete. All controls are documented above, `supabase/rls-policies.sql` is ready to run, and the service files are in `contractiq/lib/security/`. `npx tsc --noEmit` passes clean and the dev server verifiably protects real routes. Review this plan and let me know when you're ready to move to Stage 5 — the implementation plan I'll present next builds directly on these controls.
