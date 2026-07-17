# Spec 08 — Inline Key Term Editing

**Maps to:** US-009 (correction feedback loop referenced throughout PRD §8/§9/§10)
**Edge Function:** `edit-key-term`
**Depends on:** `key_terms`/`custom_key_terms` (`value`, `is_edited`, `original_ai_value`, `edited_at`), `term_corrections` audit table + `log_term_correction` trigger

---

## 1. User Flow

1. User clicks a term's value on the results page
2. `TermValueEditable` switches to an editable shadcn `Input` inline
3. On save (blur or Enter), `edit-key-term` is called optimistically
4. Term updates immediately in the UI with an "Edited" badge; on failure the UI rolls back and shows a toast

## 2. Request / Response Contract

**Request:**

```json
{
  "contract_id": "uuid",
  "term_id": "uuid",
  "term_table": "key_terms",
  "new_value": "5 years from the Effective Date"
}
```

**Success response `200`:**

```json
{
  "term_id": "uuid",
  "value": "5 years from the Effective Date",
  "is_edited": true,
  "original_ai_value": "3 years from the Effective Date"
}
```

**Errors:** `403` if RLS denies (not owner), `404` term not found. **SLA: must resolve ≤2 seconds** (PRD constraint).

## 3. Implementation — `supabase/functions/edit-key-term/index.ts`

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

    const { term_id, term_table, new_value } = await req.json()
    if (!['key_terms', 'custom_key_terms'].includes(term_table)) {
      return json({ error: 'invalid_term_table' }, 400)
    }

    const { data: existing, error: fetchError } = await supabase
      .from(term_table)
      .select('id, value, original_ai_value')
      .eq('id', term_id)
      .single()

    if (fetchError || !existing) return json({ error: 'not_found' }, 404)

    const { data: updated, error: updateError } = await supabase
      .from(term_table)
      .update({
        value: new_value,
        is_edited: true,
        // Preserve the true original AI value — only set on the FIRST edit, per engineering-doc.md §7
        original_ai_value: existing.original_ai_value ?? existing.value,
        edited_at: new Date().toISOString(),
      })
      .eq('id', term_id)
      .select()
      .single()

    // RLS denies silently (0 rows updated, no thrown error) rather than throwing —
    // treat "no row returned" as ownership denial.
    if (updateError || !updated) return json({ error: 'forbidden' }, 403)

    return json({
      term_id: updated.id,
      value: updated.value,
      is_edited: updated.is_edited,
      original_ai_value: updated.original_ai_value,
    })
  } catch (err) {
    console.error('edit-key-term error', err)
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

The `term_corrections` row is written automatically by the `log_term_correction` trigger (see `docs/specs/supabase-schema.sql` §8) whenever `value` changes — this function does not write to `term_corrections` directly.

## 4. State Management

Optimistic update directly on the `['key-terms', contract_id]` TanStack Query cache:

```ts
const editTermMutation = useMutation({
  mutationFn: (input: EditTermInput) => callEditKeyTerm(input),
  onMutate: async (input) => {
    await queryClient.cancelQueries({ queryKey: ['key-terms', input.contract_id] })
    const previous = queryClient.getQueryData(['key-terms', input.contract_id])
    queryClient.setQueryData(['key-terms', input.contract_id], (old: KeyTermsData) =>
      applyOptimisticEdit(old, input)
    )
    return { previous }
  },
  onError: (_err, input, context) => {
    queryClient.setQueryData(['key-terms', input.contract_id], context?.previous)
    toast.error('Could not save your edit. Please try again.')
  },
})
```

## 5. Component Spec

| Component | Responsibility |
|---|---|
| `TermValueEditable` | Display/edit toggle; shadcn `Input` in edit mode |
| "Edited" badge | Small Blue-outlined tag — distinct from the Violet "Custom" tag (Spec 04) so the two states are never visually confused |

## 6. Edge Cases

| Case | Behavior |
|---|---|
| Save fails (network/RLS) | Optimistic value rolled back, toast shown, `original_ai_value` untouched |
| Edit to an empty value | Allowed (user may be clearing an incorrect extraction pending manual lookup); `original_ai_value` is still preserved for the correction log |
| Second edit to an already-edited term | `original_ai_value` is **not** overwritten — always reflects the model's original output, never the previous edit |
| Editing while `process-contract` is still in flight for the same contract | Not possible in practice — the results page (and this component) only renders after `status='completed'` |
| Rapid successive edits (typo-fix-typo-fix) | Each save is a discrete optimistic mutation; last-write-wins, keyed by the input value at blur/Enter (not per-keystroke), so no debounce-related data loss |

## 7. Acceptance Criteria (US-009)

- [ ] Inline edit saves within 2 seconds
- [ ] Edited terms display an "Edited" badge
- [ ] Original AI value is preserved and never overwritten by a second edit
- [ ] A failed save rolls back to the previous value and shows a toast, without corrupting `original_ai_value`
