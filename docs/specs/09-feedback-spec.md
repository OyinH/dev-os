# Spec 09 — Feedback Collection

**Maps to:** US-010, FR-12 *(Phase 2 / P2 — included here for completeness since it shares infrastructure with the MVP results page)*
**Edge Function:** `submit-feedback`
**Depends on:** `user_feedback` table (unique on `(contract_id, user_id)`)

---

## 1. User Flow

1. On the results page, user clicks thumbs up or thumbs down
2. An optional comment field (`Popover` + `Textarea`) appears
3. Submission saves to `user_feedback`, tied to `contract_id` + `user_id`
4. Resubmitting (changing rating) upserts the existing row rather than creating a duplicate

## 2. Request / Response Contract

**Request:**

```json
{ "contract_id": "uuid", "rating": "up", "comment": "Missed the auto-renewal clause on page 4" }
```

**Success response `200`:** the full `user_feedback` row.

**Errors:** `403` if not the contract owner (RLS).

## 3. Implementation — `supabase/functions/submit-feedback/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createUserClient } from '../_shared/supabase-client.ts'

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)
    const supabase = createUserClient(authHeader)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const { contract_id, rating, comment } = await req.json()
    if (!['up', 'down'].includes(rating)) {
      return json({ error: 'invalid_rating' }, 400)
    }
    if (comment && comment.length > 1000) {
      return json({ error: 'comment_too_long' }, 422)
    }

    const { data, error } = await supabase
      .from('user_feedback')
      .upsert(
        { contract_id, user_id: user.id, rating, comment: comment ?? null, created_at: new Date().toISOString() },
        { onConflict: 'contract_id,user_id' }
      )
      .select()
      .single()

    if (error || !data) return json({ error: 'forbidden' }, 403)

    return json(data)
  } catch (err) {
    console.error('submit-feedback error', err)
    return json({ error: 'internal_error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

## 4. State Management

```ts
const feedbackMutation = useMutation({
  mutationFn: submitFeedback,
  onSuccess: (data, variables) => {
    queryClient.setQueryData(['feedback', variables.contract_id], data)
  },
})
```

No invalidate/refetch needed — the response is the full state.

## 5. Component Spec

| Component | Responsibility |
|---|---|
| `FeedbackWidget` | Toggle-style thumbs up/down buttons (shadcn `Button` group); `Popover` + `Textarea` for the optional comment; confirmation toast on submit |

## 6. Design

Thumbs buttons: outlined by default; filled `var(--color-green-500)` (up) / `var(--color-red-500)` (down) when selected — same status-color families used elsewhere.

## 7. Edge Cases

| Case | Behavior |
|---|---|
| Resubmitting feedback on the same contract | Upsert, not a duplicate row (enforced by the unique constraint) |
| Comment submitted without a rating | Rating required first — comment field only appears after a thumbs selection |
| Contract deleted after feedback given | `user_feedback` row cascades away with it — no orphaned record |
| Very long comment | Soft client-side guidance at 1000 chars (no hard PRD-specified limit; generous cap prevents abuse without being restrictive) |

## 8. Acceptance Criteria (US-010)

- [ ] Thumbs up/down + optional comment available on every results page
- [ ] Resubmitting a rating updates the existing row rather than duplicating it
- [ ] Comment field only appears after a rating is selected
