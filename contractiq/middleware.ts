import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Real app routes protected per docs/specs/01-auth-spec.md and
// engineering-doc.md §5 — NOT the security-foundation skill's generic
// example list (/chat, /profile), which don't exist as routes in this app:
// chat is a panel embedded in /contracts/[contractId], not its own route.
const PROTECTED_PREFIXES = ['/dashboard', '/upload', '/contracts', '/settings']
const AUTH_PAGES = ['/sign-in', '/sign-up']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const setAll: SetAllCookies = (cookiesToSet) => {
    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
    response = NextResponse.next({ request })
    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll,
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p))
  const isAuthPage = AUTH_PAGES.some((p) => path.startsWith(p))

  if (isProtected && !user) {
    const redirectUrl = new URL('/sign-in', request.url)
    redirectUrl.searchParams.set('returnTo', path)
    return NextResponse.redirect(redirectUrl)
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/upload/:path*',
    '/contracts/:path*',
    '/settings/:path*',
    '/sign-in',
    '/sign-up',
  ],
}
