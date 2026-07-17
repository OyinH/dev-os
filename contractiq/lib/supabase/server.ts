import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  const setAll: SetAllCookies = (cookiesToSet) => {
    try {
      cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    } catch {
      // Called from a Server Component with no writable cookie store —
      // safe to ignore since middleware.ts refreshes the session on every request.
    }
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll,
      },
    }
  )
}
