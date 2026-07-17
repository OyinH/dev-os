import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * Service-role client — bypasses RLS entirely.
 *
 * SERVER ONLY. Never import this from a 'use client' component or any code
 * path that could be bundled into the browser. Used exclusively by
 * lib/security/rateLimiter.ts, which must read/write rate_limit_events across
 * all users regardless of which user is making the current request.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
