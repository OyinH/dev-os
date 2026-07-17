-- ============================================================================
-- ContractIQ — Security Foundation: RLS Policies & Rate Limiting
-- ============================================================================
-- Run AFTER docs/specs/supabase-schema.sql on the same project.
-- Paste directly into the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- Companion: docs/security/security-plan.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. rate_limit_events — sliding-window rate limiting
-- ----------------------------------------------------------------------------
-- Written and read exclusively via the service-role client
-- (contractiq/lib/supabase/admin.ts → lib/security/rateLimiter.ts). Regular
-- users have no policy granting them access — RLS is enabled with zero
-- authenticated-role policies, which denies all direct access by design.
-- `identifier` is intentionally NOT a strict FK to auth.users(id): the
-- 'auth' action (login attempts) must be rate-limited *before* we know
-- whether the submitted email even corresponds to a real user, so it's
-- keyed by client IP instead. Authenticated actions (chat, contract
-- processing, contract upload) key by the user's UUID cast to text.
create table if not exists rate_limit_events (
  id         uuid        primary key default gen_random_uuid(),
  identifier text        not null,
  action     text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_events_lookup
  on rate_limit_events (identifier, action, created_at desc);

alter table rate_limit_events enable row level security;

-- No policies for `authenticated` or `anon` roles are created here — this is
-- intentional. Absence of a policy on an RLS-enabled table denies all access
-- to those roles; only the service-role key (which bypasses RLS entirely)
-- can read/write this table. Do not add a user-facing policy to this table.

-- ----------------------------------------------------------------------------
-- 2. Confirm RLS is enabled on every application table (idempotent)
-- ----------------------------------------------------------------------------
-- All of these already have RLS enabled + policies defined in
-- docs/specs/supabase-schema.sql. Re-asserting ENABLE here is a no-op on a
-- project where that file has already run, and a safety net if this file is
-- ever run standalone against a project that's missing it.
alter table contracts          enable row level security;
alter table key_terms          enable row level security;
alter table custom_key_terms   enable row level security;
alter table chat_sessions      enable row level security;
alter table chat_messages      enable row level security;
alter table user_feedback      enable row level security;
alter table term_corrections   enable row level security;

-- ----------------------------------------------------------------------------
-- 3. v_correction_rate_7d — close the Security Definer View gap
-- ----------------------------------------------------------------------------
-- Postgres views run with the *creator's* privileges unless security_invoker
-- is explicitly set — for a view with no such setting, that means it bypasses
-- RLS on every table it selects from entirely, regardless of who queries it.
-- This view was originally created without it, so any authenticated user
-- calling GET /rest/v1/v_correction_rate_7d saw the platform-wide correction
-- rate across every user's data, not just their own — flagged CRITICAL by
-- Supabase's database linter ("Security Definer View"). It's meant to be
-- read only by an internal alerting job via the service-role key (which
-- bypasses RLS regardless of this setting), never by a regular user session.
alter view v_correction_rate_7d set (security_invoker = true);
revoke select on v_correction_rate_7d from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Lock down SECURITY DEFINER functions + pin search_path
-- ----------------------------------------------------------------------------
-- retention_cleanup() is SECURITY DEFINER with no execute restriction — the
-- default PUBLIC grant means ANY caller, including unauthenticated anon,
-- could call POST /rest/v1/rpc/retention_cleanup directly and force a mass
-- delete of every user's contracts on demand. It's meant to run only via the
-- pg_cron job below (which invokes it in-process, not through PostgREST), so
-- revoking anon/authenticated access does not affect the real daily job.
revoke execute on function retention_cleanup() from public, anon, authenticated;

-- log_term_correction() is RETURNS trigger, so Postgres already refuses to
-- call it outside trigger context — but it still shows up as a "SECURITY
-- DEFINER function callable by anon" linter finding via the default PUBLIC
-- grant. Revoke explicitly rather than rely on that runtime restriction.
revoke execute on function log_term_correction() from public, anon, authenticated;

-- Pin search_path on every function so an attacker-controlled search_path
-- can't shadow an unqualified table/function reference inside them.
alter function set_updated_at() set search_path = public;
alter function enforce_custom_term_limit() set search_path = public;
alter function touch_contract_access(uuid) set search_path = public;

-- ----------------------------------------------------------------------------
-- 5. Verification query — run manually after applying this file
-- ----------------------------------------------------------------------------
-- Expected: every row below shows rowsecurity = true. Any table missing from
-- this list, or showing `false`, is a security gap that must be fixed before
-- launch (see docs/specs/14-testing-spec.md §5 for the pgTAP suite that
-- automates this check).
--
--   select tablename, rowsecurity
--   from pg_tables
--   where schemaname = 'public'
--   order by tablename;

-- ============================================================================
-- End of file
-- ============================================================================
