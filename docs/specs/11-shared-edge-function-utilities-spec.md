# Spec 11 — Shared Edge Function Utilities

**Used by:** every Edge Function in `supabase/functions/*`
**Location:** `supabase/functions/_shared/`

---

## 1. `_shared/cors.ts`

```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('NEXT_PUBLIC_APP_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}
```

## 2. `_shared/supabase-client.ts`

Every user-facing Edge Function forwards the caller's JWT so Postgres RLS is enforced automatically — this is the sole authorization mechanism (no custom middleware layer, per `engineering-doc.md` §6).

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

export function createUserClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
}

// Only for retention-cleanup — bypasses RLS entirely. Never use in a
// user-invoked function.
export function createServiceRoleClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}
```

## 3. `_shared/openai.ts` — retry/backoff helper

Shared by `process-contract` (Spec 03) and `chat-message` (Spec 06). 3-attempt exponential backoff on network/5xx/timeout errors, per `engineering-doc.md` §6/§8.

```ts
interface ChatCompletionRequest {
  model: string
  temperature: number
  max_tokens: number
  messages: { role: string; content: string }[]
  response_format?: { type: 'json_object' }
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

export async function callOpenAIWithRetry(request: ChatCompletionRequest): Promise<string> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (response.status === 429 || response.status >= 500) {
        throw new RetryableError(`OpenAI returned ${response.status}`)
      }
      if (!response.ok) {
        // Non-retryable client error (e.g. 400 bad request) — fail immediately.
        const body = await response.text()
        throw new Error(`OpenAI request failed: ${response.status} ${body}`)
      }

      const data = await response.json()
      return data.choices[0].message.content as string
    } catch (err) {
      lastError = err
      const isRetryable = err instanceof RetryableError || err instanceof TypeError // TypeError: network failure
      if (!isRetryable || attempt === MAX_ATTEMPTS) break

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

class RetryableError extends Error {}
```

## 4. `_shared/classify-query.ts`

See Spec 06 §3 (full implementation lives there — referenced here for discoverability since it's a shared-utility-shaped file).

## 5. Deployment note

All shared code lives under `supabase/functions/_shared/` and is imported by relative path from each function's `index.ts` (Supabase bundles each function independently at deploy time — there is no separate publish step for `_shared/`).

## 6. Acceptance Criteria

- [ ] Every user-facing Edge Function forwards the caller's JWT via `createUserClient`; none construct a service-role client except `retention-cleanup`
- [ ] `callOpenAIWithRetry` retries exactly 3 times on 429/5xx/network failure with exponential backoff, and fails immediately (no retry) on 4xx client errors
- [ ] CORS preflight (`OPTIONS`) is handled identically across every function via `handleCors`
