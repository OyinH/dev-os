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

    const { contract_id } = await req.json()
    if (typeof contract_id !== 'string' || contract_id.length === 0) {
      return json({ error: 'validation_error', message: 'contract_id is required.' }, 422)
    }

    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('id, file_path')
      .eq('id', contract_id)
      .single()

    if (fetchError || !contract) return json({ error: 'not_found' }, 404)

    // Storage cleanup FIRST — if this fails, the contract row is not
    // orphaned as a dangling Storage object (the reverse order would leak
    // files).
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
