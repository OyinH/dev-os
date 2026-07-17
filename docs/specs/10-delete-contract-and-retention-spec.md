# Spec 10 — Contract Deletion & 90-Day Retention Cleanup

**Maps to:** PRD data-retention requirements (90-day auto-delete + manual delete-at-any-time)
**Edge Functions:** `delete-contract` (user-facing), `retention-cleanup` (cron-invoked, not user-facing)
**Depends on:** `contracts` cascade chain (`key_terms`, `custom_key_terms`, `chat_sessions`, `chat_messages`, `user_feedback`, `term_corrections`), Storage bucket `contracts`

---

## 1. `delete-contract`

### User Flow

1. User clicks "Delete" on a contract (dashboard row menu or results page)
2. Confirmation dialog ("This cannot be undone")
3. `delete-contract` invoked → Storage object(s) deleted first, then the `contracts` row (cascades through every dependent table)

### Request / Response Contract

**Request:** `{ "contract_id": "uuid" }`
**Success response `200`:** `{ "success": true }`

### Implementation — `supabase/functions/delete-contract/index.ts`

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

    const { contract_id } = await req.json()

    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('id, file_path')
      .eq('id', contract_id)
      .single()

    if (fetchError || !contract) return json({ error: 'not_found' }, 404)

    // Storage cleanup FIRST — if this fails, the contract row is not orphaned
    // as a dangling Storage object (the reverse order would leak files).
    if (contract.file_path) {
      const { error: storageError } = await supabase.storage.from('contracts').remove([contract.file_path])
      if (storageError) {
        console.error('delete-contract: storage removal failed', storageError)
        // Proceed anyway — a leaked Storage object is recoverable via manual
        // cleanup; a contract the user can't delete is a worse UX outcome.
      }
    }

    const { error: deleteError } = await supabase.from('contracts').delete().eq('id', contract_id)
    if (deleteError) return json({ error: 'forbidden' }, 403)

    return json({ success: true })
  } catch (err) {
    console.error('delete-contract error', err)
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

### State Management

```ts
const deleteMutation = useMutation({
  mutationFn: deleteContract,
  onSuccess: (_data, variables) => {
    queryClient.invalidateQueries({ queryKey: ['contracts'] })
    queryClient.removeQueries({ queryKey: ['contract', variables.contract_id] })
    queryClient.removeQueries({ queryKey: ['key-terms', variables.contract_id] })
    queryClient.removeQueries({ queryKey: ['chat-messages'] }) // session-scoped, safe to prune broadly
  },
})
```

### Edge Cases

| Case | Behavior |
|---|---|
| Storage removal fails, DB delete succeeds | Contract still deletes from the user's view; orphaned Storage object is a background-cleanup concern, never a blocker to the user-facing delete |
| Contract already deleted (double-click) | Second call returns `404 not_found` — client treats this as a no-op success (item is already gone from the list) |
| Deleting a contract with an active chat session | Cascades automatically via `chat_sessions`/`chat_messages` FK `on delete cascade` — no separate cleanup step needed |

---

## 2. `retention-cleanup` (cron-invoked, not user-facing)

### Trigger

`pg_cron` schedule defined directly in `docs/specs/supabase-schema.sql` (`retention-cleanup-daily`, `0 3 * * *` UTC) calls the `retention_cleanup()` Postgres function, which runs with `security definer` and does **not** go through an Edge Function or RLS — this is the one path in the system that legitimately needs to operate across all users.

```sql
-- Already included in supabase-schema.sql §10 — reproduced here for reference
create or replace function retention_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from contracts
  where last_accessed_at < now() - interval '90 days';
end;
$$;
```

### Why a Postgres function instead of an Edge Function

Deleting the `contracts` row cascades through every dependent table automatically via `on delete cascade` (§7 of `engineering-doc.md`). The one thing a Postgres function *cannot* do is delete the associated Storage objects — Storage lives outside Postgres. See §3 below for how that gap is closed.

### 3. Storage cleanup for retention-expired contracts

Because `retention_cleanup()` is pure SQL, it cannot call `storage.objects` removal APIs. A companion **Edge Function** `retention-cleanup` (service-role key, invoked on the same daily schedule via `pg_cron`'s `net.http_post` to the function's URL, *before* the SQL deletion runs) handles the Storage side:

```ts
// supabase/functions/retention-cleanup/index.ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

serve(async (req) => {
  // Verify this is an internal cron invocation, not a public request.
  const cronSecret = req.headers.get('X-Cron-Secret')
  if (cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // service-role: the one legitimate use of this key
  )

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: expired, error } = await supabase
    .from('contracts')
    .select('id, file_path')
    .lt('last_accessed_at', cutoff)

  if (error) {
    console.error('retention-cleanup: fetch failed', error)
    return new Response('error', { status: 500 })
  }

  const paths = (expired ?? []).map((c) => c.file_path).filter((p): p is string => !!p)
  if (paths.length > 0) {
    await supabase.storage.from('contracts').remove(paths)
  }

  // The subsequent pg_cron SQL job (retention_cleanup()) deletes the DB rows;
  // this function only needs to precede it and clear Storage first.
  return new Response(JSON.stringify({ deleted_storage_objects: paths.length }), { status: 200 })
})
```

**Scheduling note:** set the Edge Function's `pg_cron` entry to run a few minutes *before* `retention-cleanup-daily` (e.g. `55 2 * * *` vs `0 3 * * *`) so Storage cleanup always precedes the row deletion — deleting the DB row first would make `file_path` unrecoverable for the Storage-side cleanup pass.

### Edge Cases

| Case | Behavior |
|---|---|
| Storage cleanup runs but the DB row somehow survives (race/failure) | Next day's run re-queries `last_accessed_at < cutoff` and finds it again — idempotent, no duplicate-deletion risk since `storage.remove()` on an already-removed key is a no-op |
| A user accesses a contract at 89 days, 23 hours | `touch_contract_access` (Spec 05 §2) resets `last_accessed_at`, so it survives this run and the next 90-day window starts fresh |

## 4. Acceptance Criteria

- [ ] User-initiated delete removes the contract from the dashboard immediately and cascades through all dependent tables
- [ ] Storage objects are removed before the DB row on user-initiated delete
- [ ] Contracts untouched for 90 days are automatically deleted, including their Storage objects
- [ ] Accessing a contract (viewing its results page) resets its retention window
