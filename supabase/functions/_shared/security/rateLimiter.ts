import { createServiceRoleClient } from '../supabase-client.ts'

// Deno mirror of contractiq/lib/security/rateLimiter.ts. That file is the
// canonical rule definitions and is the one actually invoked for the 'auth'
// action (app/api/auth/login|signup routes, same Next.js runtime). This copy
// exists because Edge Functions (Deno) cannot import Next.js modules across
// the runtime boundary — it must be kept in sync by hand for the actions
// enforced here: 'contract_upload', 'contract_processing', and 'chat'.

export type RateLimitedAction = 'contract_upload' | 'contract_processing' | 'chat'

interface RateLimitRule {
  limit: number
  windowMs: number
}

const RULES: Record<RateLimitedAction, RateLimitRule> = {
  contract_processing: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 requests / hour
  contract_upload: { limit: 20, windowMs: 24 * 60 * 60 * 1000 }, // 20 uploads / day
  chat: { limit: 30, windowMs: 60 * 1000 }, // 30 requests / minute
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Sliding-window rate limit check backed by `rate_limit_events`. Always uses
 * the service-role client so a caller cannot inflate or erase their own
 * count via a client-side call (the table has no authenticated-role RLS
 * policy at all — see supabase/rls-policies.sql / database.sql).
 *
 * `identifier` is the authenticated user's UUID (these two actions always
 * run post-auth, unlike the Next.js 'auth' action which is pre-auth and
 * keys by IP).
 *
 * On `allowed: true`, this function also records the event. Callers must not
 * call it twice for the same request.
 */
export async function checkRateLimit(identifier: string, action: RateLimitedAction): Promise<RateLimitResult> {
  const rule = RULES[action]
  const admin = createServiceRoleClient()
  const windowStart = new Date(Date.now() - rule.windowMs).toISOString()

  const { count, error } = await admin
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('action', action)
    .gte('created_at', windowStart)

  if (error) {
    // Fail closed: an infrastructure error here should not become a way to
    // bypass the limit on actions that directly cost OpenAI/storage spend.
    console.error('checkRateLimit: query failed', error)
    return { allowed: false, retryAfterSeconds: 60 }
  }

  if ((count ?? 0) >= rule.limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil(rule.windowMs / 1000) }
  }

  await admin.from('rate_limit_events').insert({ identifier, action })
  return { allowed: true, retryAfterSeconds: 0 }
}
