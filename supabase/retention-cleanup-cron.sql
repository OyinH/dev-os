-- ============================================================================
-- Retention cleanup: Storage-side cron scheduling
--
-- docs/specs/supabase-schema.sql §10 already schedules the pure-SQL
-- retention_cleanup() job (deletes DB rows) daily at 03:00 UTC. That
-- function cannot touch Storage objects, so the retention-cleanup Edge
-- Function (supabase/functions/retention-cleanup) handles that side. Per
-- docs/specs/10-delete-contract-and-retention-spec.md §"Scheduling note",
-- this must run a few minutes BEFORE the SQL job so file_path is still
-- readable when Storage cleanup runs — deleting the DB row first would
-- make it unrecoverable for this pass.
--
-- Requires the pg_net extension (Database > Extensions) in addition to
-- pg_cron. Run this after docs/specs/supabase-schema.sql.
-- ============================================================================

select cron.schedule(
  'retention-cleanup-storage-daily',
  '55 2 * * *', -- 02:55 UTC, five minutes before retention-cleanup-daily (03:00 UTC)
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/retention-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.settings.cron_secret')
    )
  );
  $$
);
