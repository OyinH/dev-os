-- ============================================================================
-- RLS cross-user denial suite (pgTAP)
--
-- Required pre-launch per PRD Internal Risks table
-- (docs/specs/14-testing-spec.md §5) — a hard gate, not a nice-to-have.
-- Every table with user-facing RLS policies gets at least one cross-user
-- denial assertion here. rate_limit_events is intentionally excluded: it has
-- zero authenticated-role policies (service-role only, per
-- docs/security/security-plan.md issue #1), so there is no user-facing
-- access path to test a denial against.
--
-- Run via `supabase test db` (requires the pgTAP extension and Supabase's
-- test helper schema enabled on the test project — not the production
-- project).
-- ============================================================================

begin;
select plan(9);

-- Seed two users and one contract owned by user A.
select tests.create_supabase_user('user_a@test.com');
select tests.create_supabase_user('user_b@test.com');

select tests.authenticate_as('user_a@test.com');

insert into contracts (id, user_id, title, contract_type, file_path, contract_text, page_count, status)
values (
  '00000000-0000-0000-0000-000000000001',
  tests.get_supabase_uid('user_a@test.com'),
  'Fixture NDA',
  'NDA',
  'user-a/fixture.pdf',
  '[PAGE 1]\nSample contract text.',
  1,
  'completed'
);

insert into key_terms (contract_id, term_name, value, page_number, confidence_score, source_sentence)
values ('00000000-0000-0000-0000-000000000001', 'Parties', 'Acme Corp and Beta LLC', 1, 90, 'Sample contract text.');

insert into custom_key_terms (contract_id, term_name, value, page_number, confidence_score, source_sentence)
values ('00000000-0000-0000-0000-000000000001', 'Non-compete radius', '50 miles', 1, 80, 'Sample contract text.');

insert into chat_sessions (id, contract_id, user_id)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', tests.get_supabase_uid('user_a@test.com'));

insert into chat_messages (session_id, role, content)
values ('00000000-0000-0000-0000-000000000002', 'user', 'Does this auto-renew?');

insert into user_feedback (contract_id, user_id, rating)
values ('00000000-0000-0000-0000-000000000001', tests.get_supabase_uid('user_a@test.com'), 'up');

-- Switch to user B and attempt cross-user access on every table.
select tests.authenticate_as('user_b@test.com');

select is_empty(
  $$ select * from contracts where id = '00000000-0000-0000-0000-000000000001' $$,
  'user_b cannot read user_a''s contracts'
);

select is_empty(
  $$ select * from key_terms where contract_id = '00000000-0000-0000-0000-000000000001' $$,
  'user_b cannot read user_a''s key_terms'
);

select throws_ok(
  $$ update key_terms set value = 'hacked' where contract_id = '00000000-0000-0000-0000-000000000001' $$,
  'user_b cannot update key_terms belonging to user_a''s contract'
);

select is_empty(
  $$ select * from custom_key_terms where contract_id = '00000000-0000-0000-0000-000000000001' $$,
  'user_b cannot read user_a''s custom_key_terms'
);

select throws_ok(
  $$ update custom_key_terms set value = 'hacked' where contract_id = '00000000-0000-0000-0000-000000000001' $$,
  'user_b cannot update custom_key_terms belonging to user_a''s contract'
);

select is_empty(
  $$ select * from chat_sessions where contract_id = '00000000-0000-0000-0000-000000000001' $$,
  'user_b cannot read user_a''s chat_sessions'
);

select is_empty(
  $$ select * from chat_messages where session_id = '00000000-0000-0000-0000-000000000002' $$,
  'user_b cannot read user_a''s chat_messages'
);

select is_empty(
  $$ select * from user_feedback where contract_id = '00000000-0000-0000-0000-000000000001' $$,
  'user_b cannot read user_a''s user_feedback'
);

-- term_corrections is select-only by policy (populated only by the
-- log_term_correction trigger) — assert the same cross-user read denial.
select tests.authenticate_as('user_a@test.com');
update key_terms set value = 'corrected value' where contract_id = '00000000-0000-0000-0000-000000000001';
select tests.authenticate_as('user_b@test.com');

select is_empty(
  $$ select * from term_corrections where contract_id = '00000000-0000-0000-0000-000000000001' $$,
  'user_b cannot read user_a''s term_corrections'
);

select * from finish();
rollback;
