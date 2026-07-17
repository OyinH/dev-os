'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'

// A 401 from any Edge Function while signed in means the session expired —
// redirect to /sign-in rather than surfacing a silent/broken query state,
// per docs/specs/01-auth-spec.md §6/§7. A full navigation (not router.push)
// is deliberate here: this handler runs outside the React tree via
// QueryCache/MutationCache, and a hard redirect also re-runs middleware.ts's
// session check.
function redirectOnSessionExpiry(error: unknown) {
  if (error instanceof FunctionsHttpError && error.context.status === 401) {
    const returnTo = encodeURIComponent(window.location.pathname)
    window.location.href = `/sign-in?returnTo=${returnTo}`
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
        queryCache: new QueryCache({ onError: redirectOnSessionExpiry }),
        mutationCache: new MutationCache({ onError: redirectOnSessionExpiry }),
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
