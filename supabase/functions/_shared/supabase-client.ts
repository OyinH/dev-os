import { createClient } from 'jsr:@supabase/supabase-js@2'

// Every user-facing Edge Function forwards the caller's JWT so Postgres RLS
// is enforced automatically — this is the sole authorization mechanism (no
// custom middleware layer, per engineering-doc.md §6).
export function createUserClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
}

// Only for retention-cleanup — bypasses RLS entirely. Never use in a
// user-invoked function.
export function createServiceRoleClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}
