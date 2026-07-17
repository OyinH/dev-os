import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authSchema } from '@/lib/security/inputValidator'
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimiter'

/**
 * Server-side signup. Mirrors app/api/auth/login/route.ts: rate-limited by
 * IP before the request ever reaches Supabase Auth, and validated with the
 * same authSchema so a weak/malformed password never gets that far.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers)

  const rateLimit = await checkRateLimit(ip, 'auth')
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many attempts. Please try again shortly.' },
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
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  })

  if (error) {
    const alreadyExists = /already registered|already exists/i.test(error.message)
    return NextResponse.json(
      {
        error: alreadyExists ? 'ACCOUNT_EXISTS' : 'SIGNUP_FAILED',
        message: alreadyExists ? 'An account with this email already exists.' : error.message,
      },
      { status: alreadyExists ? 409 : 400 }
    )
  }

  return NextResponse.json({ message: 'Check your email to verify your account.' })
}
