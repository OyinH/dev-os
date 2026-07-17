import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createUserClient } from '../_shared/supabase-client.ts'
import { verifyContractOwnership } from '../_shared/security/chatSecurity.ts'

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)
    const supabase = createUserClient(authHeader)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const { contract_id, rating, comment } = await req.json()
    if (typeof contract_id !== 'string' || contract_id.length === 0) {
      return json({ error: 'validation_error', message: 'contract_id is required.' }, 422)
    }
    if (!['up', 'down'].includes(rating)) {
      return json({ error: 'invalid_rating' }, 400)
    }
    if (comment && (typeof comment !== 'string' || comment.length > 1000)) {
      return json({ error: 'comment_too_long' }, 422)
    }

    // user_feedback's RLS policy only checks that the row being written has
    // user_id = auth.uid() — it has no way to see whether contract_id
    // actually belongs to that user (that's a different table). Without this
    // check, any authenticated user could attach feedback to any contract
    // UUID they happen to know, not just their own.
    const ownership = await verifyContractOwnership(supabase, contract_id, user.id)
    if (!ownership.ok) return json({ error: 'not_found' }, 404)

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
