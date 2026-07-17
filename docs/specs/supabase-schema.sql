-- ============================================================================
-- ContractIQ — Supabase Schema
-- ============================================================================
-- Paste this entire file into the Supabase SQL Editor (or `supabase/migrations/`)
-- and run it on a fresh project. Idempotent-safe where practical, but intended
-- to run once against an empty project.
--
-- Companion docs: docs/engineering/engineering-doc.md §7, docs/specs/*.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_cron";    -- retention-cleanup schedule

-- ----------------------------------------------------------------------------
-- 1. updated_at trigger helper (shared by every table with that column)
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 2. contracts
-- ============================================================================
create table contracts (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  title                       text not null,
  contract_type               text not null check (contract_type in ('NDA', 'MSA')),
  detected_contract_type      text check (detected_contract_type in ('NDA', 'MSA')),
  file_path                   text,
  contract_text               text not null,
  page_count                  int not null,
  token_count                 int,
  status                      text not null default 'processing' check (status in ('processing', 'completed', 'error')),
  error_message               text,
  processing_started_at       timestamptz default now(),
  processing_completed_at     timestamptz,
  last_accessed_at            timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_contracts_user_id on contracts(user_id);
create index idx_contracts_status on contracts(status);
create index idx_contracts_last_accessed_at on contracts(last_accessed_at);
create index idx_contracts_user_created on contracts(user_id, created_at desc);

create trigger trg_contracts_updated_at
  before update on contracts
  for each row execute function set_updated_at();

alter table contracts enable row level security;

create policy "contracts_select_own" on contracts for select
  using (auth.uid() = user_id);
create policy "contracts_insert_own" on contracts for insert
  with check (auth.uid() = user_id);
create policy "contracts_update_own" on contracts for update
  using (auth.uid() = user_id);
create policy "contracts_delete_own" on contracts for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- 3. key_terms (standard, AI-extracted)
-- ============================================================================
create table key_terms (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references contracts(id) on delete cascade,
  term_name           text not null,
  value               text,
  page_number         int,
  confidence_score    numeric(5,2) check (confidence_score between 0 and 100),
  source_sentence     text,
  is_edited           boolean not null default false,
  original_ai_value   text,
  edited_at           timestamptz,
  display_order       int,
  created_at          timestamptz not null default now()
);

create unique index uq_key_terms_contract_term on key_terms(contract_id, term_name);
create index idx_key_terms_contract_id on key_terms(contract_id);

alter table key_terms enable row level security;

create policy "key_terms_all_own_via_contract" on key_terms for all
  using (
    exists (select 1 from contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

-- ============================================================================
-- 4. custom_key_terms
-- ============================================================================
create table custom_key_terms (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references contracts(id) on delete cascade,
  term_name           text not null check (char_length(term_name) <= 100),
  value               text,
  page_number         int,
  confidence_score    numeric(5,2) check (confidence_score between 0 and 100),
  source_sentence     text,
  is_edited           boolean not null default false,
  original_ai_value   text,
  edited_at           timestamptz,
  display_order       int,
  is_manual           boolean not null default true,
  created_at          timestamptz not null default now()
);

create index idx_custom_key_terms_contract_id on custom_key_terms(contract_id);

alter table custom_key_terms enable row level security;

create policy "custom_key_terms_all_own_via_contract" on custom_key_terms for all
  using (
    exists (select 1 from contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  );

-- 5-custom-term cap, enforced server-side regardless of client behavior
create or replace function enforce_custom_term_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  existing_count int;
begin
  select count(*) into existing_count
  from custom_key_terms
  where contract_id = new.contract_id;

  if existing_count >= 5 then
    raise exception 'Custom key term limit (5) exceeded for contract %', new.contract_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_custom_term_limit
  before insert on custom_key_terms
  for each row execute function enforce_custom_term_limit();

-- ============================================================================
-- 5. chat_sessions
-- ============================================================================
create table chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null unique references contracts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_chat_sessions_user_id on chat_sessions(user_id);

create trigger trg_chat_sessions_updated_at
  before update on chat_sessions
  for each row execute function set_updated_at();

alter table chat_sessions enable row level security;

create policy "chat_sessions_all_own" on chat_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 6. chat_messages
-- ============================================================================
create table chat_messages (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references chat_sessions(id) on delete cascade,
  role                  text not null check (role in ('user', 'assistant')),
  content               text not null,
  cited_pages           int[] not null default '{}',
  query_classification  text check (query_classification in ('contract', 'history', 'both')),
  created_at            timestamptz not null default now()
);

create index idx_chat_messages_session_created on chat_messages(session_id, created_at);

alter table chat_messages enable row level security;

create policy "chat_messages_all_own_via_session" on chat_messages for all
  using (
    exists (
      select 1 from chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. user_feedback
-- ============================================================================
create table user_feedback (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references contracts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  rating       text not null check (rating in ('up', 'down')),
  comment      text check (char_length(comment) <= 1000),
  created_at   timestamptz not null default now()
);

create unique index uq_user_feedback_contract_user on user_feedback(contract_id, user_id);

alter table user_feedback enable row level security;

create policy "user_feedback_all_own" on user_feedback for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 8. term_corrections (append-only audit log)
-- ============================================================================
create table term_corrections (
  id                   uuid primary key default gen_random_uuid(),
  contract_id          uuid not null references contracts(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  term_table           text not null check (term_table in ('key_terms', 'custom_key_terms')),
  term_id              uuid not null,
  term_name            text not null,
  original_ai_value    text,
  corrected_value      text,
  corrected_at         timestamptz not null default now()
);

create index idx_term_corrections_corrected_at on term_corrections(corrected_at);
create index idx_term_corrections_contract_id on term_corrections(contract_id);

alter table term_corrections enable row level security;

create policy "term_corrections_select_own" on term_corrections for select
  using (auth.uid() = user_id);
-- No insert/update/delete policy for authenticated users: rows are written
-- exclusively by the log_term_correction() trigger below (SECURITY DEFINER).

-- log_term_correction: fires on key_terms/custom_key_terms UPDATE when value changes
create or replace function log_term_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.value is distinct from old.value then
    select c.user_id into v_user_id from contracts c where c.id = new.contract_id;

    insert into term_corrections (
      contract_id, user_id, term_table, term_id, term_name,
      original_ai_value, corrected_value
    ) values (
      new.contract_id, v_user_id, TG_TABLE_NAME, new.id, new.term_name,
      coalesce(old.original_ai_value, old.value), new.value
    );
  end if;
  return new;
end;
$$;

create trigger trg_log_term_correction_key_terms
  after update on key_terms
  for each row execute function log_term_correction();

create trigger trg_log_term_correction_custom_key_terms
  after update on custom_key_terms
  for each row execute function log_term_correction();

-- Postgres already refuses to call a RETURNS trigger function outside
-- trigger context, but the default PUBLIC execute grant still shows up as a
-- "SECURITY DEFINER function callable by anon" linter finding. Revoke it
-- explicitly rather than rely on that runtime restriction as the only guard.
revoke execute on function log_term_correction() from public, anon, authenticated;

-- Rolling 7-day correction-rate view (PRD §8/§10: >12% triggers a prompt review)
-- Platform-wide aggregate for the alerting job's service-role query — never
-- meant to be readable by a regular user's session. security_invoker = true
-- (not the Postgres default) makes it run as the querying role rather than
-- the view owner, so RLS on the underlying tables is actually enforced
-- instead of silently bypassed; the REVOKE below is the belt-and-suspenders
-- layer in case a future recreate drops that setting (see
-- supabase/rls-policies.sql, applied idempotently to the live project too).
create or replace view v_correction_rate_7d
with (security_invoker = true) as
select
  coalesce(corrections.cnt, 0)::numeric as corrections_last_7d,
  coalesce(terms.cnt, 0)::numeric as terms_created_last_7d,
  case
    when coalesce(terms.cnt, 0) = 0 then 0
    else round(coalesce(corrections.cnt, 0)::numeric / terms.cnt::numeric, 4)
  end as correction_rate
from
  (select count(*) as cnt from term_corrections where corrected_at >= now() - interval '7 days') corrections,
  (
    select count(*) as cnt from (
      select created_at from key_terms where created_at >= now() - interval '7 days'
      union all
      select created_at from custom_key_terms where created_at >= now() - interval '7 days'
    ) all_terms
  ) terms;

revoke select on v_correction_rate_7d from anon, authenticated;

-- ============================================================================
-- 9. touch_contract_access RPC (drives 90-day retention window)
-- ============================================================================
create or replace function touch_contract_access(p_contract_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update contracts
  set last_accessed_at = now()
  where id = p_contract_id
    and user_id = auth.uid();
end;
$$;

grant execute on function touch_contract_access(uuid) to authenticated;

-- ============================================================================
-- 10. retention-cleanup (service-role only, invoked by pg_cron)
-- ============================================================================
create or replace function retention_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from contracts
  where last_accessed_at < now() - interval '90 days';
end;
$$;

-- SECURITY DEFINER + the default PUBLIC execute grant means, without this,
-- ANY caller — including unauthenticated anon — could hit
-- /rest/v1/rpc/retention_cleanup directly and force a mass delete across
-- every user's contracts on demand. pg_cron below invokes this in-process
-- (as the scheduling role), never through PostgREST, so revoking anon/
-- authenticated access does not affect the actual daily job.
revoke execute on function retention_cleanup() from public, anon, authenticated;

-- Runs daily at 03:00 UTC. Requires pg_cron enabled on the project (Database > Extensions).
select cron.schedule(
  'retention-cleanup-daily',
  '0 3 * * *',
  $$ select retention_cleanup(); $$
);

-- ============================================================================
-- 11. Storage — `contracts` bucket
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Object key convention: {user_id}/{contract_id}/{filename}.pdf
-- (bucket name already scopes "contracts/"; do not duplicate it in the key)
create policy "insert own contract pdf" on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "select own contract pdf" on storage.objects for select to authenticated
  using (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "delete own contract pdf" on storage.objects for delete to authenticated
  using (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- End of schema
-- ============================================================================
