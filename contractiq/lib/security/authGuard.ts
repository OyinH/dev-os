import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export interface AuthResult {
  user: User
}

/**
 * Verifies the caller has a valid Supabase session. Use at the top of every
 * Route Handler that requires authentication (e.g. app/api/auth/logout).
 *
 * Returns either the authenticated user, or a ready-to-return 401 Response —
 * callers should check `'response' in result` before proceeding.
 */
export async function requireAuth(): Promise<AuthResult | { response: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      response: NextResponse.json(
        { error: 'unauthorized', message: 'You must be signed in to perform this action.' },
        { status: 401 }
      ),
    }
  }

  return { user }
}
