// Deno mirror of contractiq/lib/security/chatSecurity.ts (canonical).
// Explicit ownership checks layered on top of (not instead of) Postgres RLS
// — worth double-checking explicitly because a session is looked up
// indirectly via contract_id before any chat_messages RLS policy is even
// evaluated.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any

export type OwnershipCheck = { ok: true } | { ok: false; reason: 'not_found' }

export async function verifyContractOwnership(
  supabase: AnySupabaseClient,
  contractId: string,
  userId: string
): Promise<OwnershipCheck> {
  const { data, error } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', contractId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return { ok: false, reason: 'not_found' }
  return { ok: true }
}

export async function verifyContractReadyForChat(
  supabase: AnySupabaseClient,
  contractId: string,
  userId: string
): Promise<OwnershipCheck & { status?: string }> {
  const { data, error } = await supabase
    .from('contracts')
    .select('id, status')
    .eq('id', contractId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return { ok: false, reason: 'not_found' }
  if (data.status !== 'completed') return { ok: false, reason: 'not_found', status: data.status }
  return { ok: true }
}
