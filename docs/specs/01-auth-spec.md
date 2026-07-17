# Spec 01 — Authentication & Session Management

**Maps to:** US-001, FR-01
**Depends on:** `docs/specs/supabase-schema.sql` (no custom tables — uses `auth.users`)
**Edge Functions:** none (Supabase Auth handles this client-side)

---

## 1. Overview

Email/password authentication via Supabase Auth. No custom `profiles` table at MVP — email is the only identity attribute the app needs. Every other table's `user_id` FK references `auth.users(id) on delete cascade`, so account deletion cascades through the entire schema automatically.

## 2. User Flow

1. Visitor lands on `/` (marketing page), clicks "Get Started Free" → `/sign-up`
2. Submits email + password → `supabase.auth.signUp({ email, password })`
3. Supabase sends a verification email with a redirect to `${NEXT_PUBLIC_APP_URL}/auth/callback`
4. User clicks the email link → `app/auth/callback/route.ts` exchanges the code for a session → redirect to `/dashboard`
5. Returning user visits `/sign-in`, submits credentials → `supabase.auth.signInWithPassword()` → redirect to `/dashboard` on success, inline error on failure
6. Any request to an `(app)` route group without a valid session is redirected to `/sign-in?returnTo=<path>` by `middleware.ts`
7. Sign-out: `supabase.auth.signOut()` → redirect to `/`

## 3. File-by-file implementation

### `lib/supabase/client.ts` (browser client)

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### `lib/supabase/server.ts` (server component / route handler client)

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component with no writable cookie store —
            // safe to ignore since middleware.ts refreshes the session.
          }
        },
      },
    }
  )
}
```

### `middleware.ts` (root)

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/dashboard', '/upload', '/contracts', '/settings']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtected = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))

  if (isProtected && !user) {
    const redirectUrl = new URL('/sign-in', request.url)
    redirectUrl.searchParams.set('returnTo', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/upload/:path*', '/contracts/:path*', '/settings/:path*'],
}
```

### `app/auth/callback/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const returnTo = searchParams.get('returnTo') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${returnTo}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
}
```

### `app/(auth)/sign-up/page.tsx` — form submit handler contract

```ts
const { error } = await supabase.auth.signUp({
  email,
  password,
  options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
})
```

- Success → show "Check your email to verify your account" (do not auto-redirect; no session exists yet)
- Error `user_already_exists` → rephrase to "An account with this email already exists"
- Any other error → surface `error.message` verbatim in the inline `Alert`

### `app/(auth)/sign-in/page.tsx` — form submit handler contract

```ts
const { error } = await supabase.auth.signInWithPassword({ email, password })
```

- Success → `router.push(returnTo ?? '/dashboard')`
- Error `invalid_credentials` → "Incorrect email or password"
- Error `email_not_confirmed` → "Please verify your email before signing in" + "Resend verification email" link (calls `supabase.auth.resend({ type: 'signup', email })`)

## 4. Component Spec

| Component | Responsibility |
|---|---|
| `SignUpForm` | email + password inputs (shadcn `Input`), client-side validation (valid email, password ≥8 chars), submit button with loading state, inline `Alert` for errors |
| `SignInForm` | email + password inputs, "Forgot password?" link (out of scope — see §6), inline `Alert`, loading state |
| `AuthLayout` | centered card wrapper shared by both forms |

## 5. Design

Per `docs/design.md`: centered card, `radius: 8px` (`--radius-card`), `background: var(--bg-primary)`. Primary submit button: `background: var(--brand)` (Blue 500 `#115ACB`), white text, `radius: 6px`. Inline error: `background: var(--color-red-50)`, `color: var(--color-red-700)`, `border: 1px solid var(--color-red-200)`.

## 6. Edge Cases

| Case | Behavior |
|---|---|
| Invalid credentials | Clear inline error — never a generic "something went wrong" |
| Duplicate email sign-up | Supabase's `user_already_exists` rephrased: "An account with this email already exists" |
| Unverified email sign-in attempt | Inline prompt + "Resend verification email" action |
| Session expires mid-session (long-open results page) | Next mutation call returns `401` → client redirects to `/sign-in?returnTo=<current path>` |
| Password reset | **Out of scope for MVP** — not in PRD user stories; do not implement a "Forgot password" flow beyond a disabled/hidden link, to avoid an unspecced surface |
| Auth flow latency | Must complete ≤10s (PRD constraint) — no artificial delays, no blocking analytics calls in the submit handler |

## 7. Acceptance Criteria (from PRD/US-001)

- [ ] Sign-up creates a Supabase Auth user and sends a verification email
- [ ] Clicking the verification link establishes a session and redirects to `/dashboard`
- [ ] Sign-in with valid credentials redirects to `/dashboard` (or `returnTo`) in ≤10s
- [ ] Sign-in with invalid credentials shows a clear inline error, no redirect
- [ ] Visiting any `(app)` route while signed out redirects to `/sign-in` with `returnTo` preserved
- [ ] Sign-out clears the session and redirects to `/`
- [ ] A `401` from any Edge Function while signed in (expired session) triggers a redirect to `/sign-in`, not a silent failure
