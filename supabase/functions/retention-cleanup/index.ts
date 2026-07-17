import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

serve(async (req) => {
  // Verify this is an internal cron invocation, not a public request.
  const cronSecret = req.headers.get('X-Cron-Secret')
  if (cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // service-role: the one legitimate use of this key
  )

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: expired, error } = await supabase.from('contracts').select('id, file_path').lt('last_accessed_at', cutoff)

  if (error) {
    console.error('retention-cleanup: fetch failed', error)
    return new Response('error', { status: 500 })
  }

  const paths = (expired ?? []).map((c) => c.file_path).filter((p): p is string => !!p)
  if (paths.length > 0) {
    await supabase.storage.from('contracts').remove(paths)
  }

  // The subsequent pg_cron SQL job (retention_cleanup()) deletes the DB
  // rows; this function only needs to precede it and clear Storage first.
  return new Response(JSON.stringify({ deleted_storage_objects: paths.length }), { status: 200 })
})
