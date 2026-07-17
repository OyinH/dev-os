import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authSchema } from '@/lib/security/inputValidator'
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimiter'

/**
 * Server-side login. Handles signInWithPassword() here (rather than
 * client-side) so the session cookie is set via the request/response cycle
 * @supabase/ssr expects, and so login attempts can be rate-limited
 * server-side before they ever reach Supabase Auth.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers)

  const rateLimit = await checkRateLimit(ip, 'auth')
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many login attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = authSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 422 }
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    if (error.message === 'Email not confirmed') {
      return NextResponse.json(
        { error: 'EMAIL_NOT_CONFIRMED', message: 'Please verify your email before signing in.' },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { error: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
      { status: 401 }
    )
  }

  return NextResponse.json({ user: data.user })
}
