import { createAdminClient } from '@/lib/supabase/admin'

export type RateLimitedAction = 'auth' | 'chat' | 'contract_processing' | 'contract_upload'

interface RateLimitRule {
  limit: number
  windowMs: number
}

/**
 * One rule per action. Mirrored in
 * supabase/functions/_shared/security/rateLimiter.ts (Deno) for the actions
 * enforced inside Edge Functions (chat, contract_processing,
 * contract_upload) — this Next.js copy is the canonical definition and the
 * one actually invoked by app/api/auth/login/route.ts for 'auth'.
 */
const RULES: Record<RateLimitedAction, RateLimitRule> = {
  auth: { limit: 10, windowMs: 60 * 1000 }, // 10 requests / minute
  chat: { limit: 30, windowMs: 60 * 1000 }, // 30 requests / minute
  contract_processing: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 requests / hour
  contract_upload: { limit: 20, windowMs: 24 * 60 * 60 * 1000 }, // 20 uploads / day
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Sliding-window rate limit check backed by `rate_limit_events`. Always uses
 * the service-role client so a caller cannot inflate or erase their own
 * count via a client-side call (the table has no authenticated-role RLS
 * policy at all — see supabase/rls-policies.sql).
 *
 * `identifier` is the user's UUID for already-authenticated actions (chat,
 * contract_processing, contract_upload), or the client IP for the 'auth'
 * action, since a login attempt may not correspond to a real user yet.
 *
 * On `allowed: true`, this function also records the event. Callers must not
 * call it twice for the same request.
 */
export async function checkRateLimit(
  identifier: string,
  action: RateLimitedAction
): Promise<RateLimitResult> {
  const rule = RULES[action]
  const admin = createAdminClient()
  const windowStart = new Date(Date.now() - rule.windowMs).toISOString()

  const { count, error } = await admin
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('action', action)
    .gte('created_at', windowStart)

  if (error) {
    // Fail closed on infrastructure errors for auth (the highest-abuse-risk
    // action); fail open for everything else so a rate-limiter outage
    // doesn't take down the whole app.
    console.error('checkRateLimit: query failed', error)
    return action === 'auth'
      ? { allowed: false, retryAfterSeconds: 60 }
      : { allowed: true, retryAfterSeconds: 0 }
  }

  if ((count ?? 0) >= rule.limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil(rule.windowMs / 1000) }
  }

  await admin.from('rate_limit_events').insert({ identifier, action })
  return { allowed: true, retryAfterSeconds: 0 }
}

/**
 * Best-effort client IP extraction for pre-auth rate limiting (the 'auth'
 * action). Vercel populates x-forwarded-for; falls back to a constant so a
 * missing header degrades to "one shared bucket" rather than throwing.
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}
