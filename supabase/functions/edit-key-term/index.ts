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

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const { term_id, term_table, new_value } = await req.json()
    if (typeof term_id !== 'string' || term_id.length === 0) {
      return json({ error: 'validation_error', message: 'term_id is required.' }, 422)
    }
    if (!['key_terms', 'custom_key_terms'].includes(term_table)) {
      return json({ error: 'invalid_term_table' }, 400)
    }
    if (typeof new_value !== 'string') {
      return json({ error: 'validation_error', message: 'new_value must be a string.' }, 422)
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
        // Preserve the true original AI value — only set on the FIRST edit.
        original_ai_value: existing.original_ai_value ?? existing.value,
        edited_at: new Date().toISOString(),
      })
      .eq('id', term_id)
      .select()
      .single()

    // RLS denies silently (0 rows updated, no thrown error) rather than
    // throwing — treat "no row returned" as ownership denial.
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
