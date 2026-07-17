import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/security/authGuard'

/**
 * Server-side logout. The client must call this route instead of invoking
 * supabase.auth.signOut() directly, so the session cookie is cleared
 * consistently server-side.
 */
export async function POST() {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response

  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return NextResponse.json({ error: 'SIGN_OUT_FAILED', message: 'Could not sign out. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
