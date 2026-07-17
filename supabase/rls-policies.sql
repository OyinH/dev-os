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
-- 3. Verification query — run manually after applying this file
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
