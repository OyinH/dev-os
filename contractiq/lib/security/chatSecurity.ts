import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * Explicit ownership checks for chat, layered on top of (not instead of)
 * Postgres RLS — RLS already scopes every query to auth.uid(), but the
 * chat-message flow is worth double-checking explicitly because a session
 * is looked up indirectly via contract_id before any chat_messages RLS
 * policy is even evaluated (docs/specs/06-contract-chat-spec.md §5).
 *
 * Runtime note: the actual call site is
 * supabase/functions/chat-message/index.ts via its Deno mirror
 * (supabase/functions/_shared/security/chatSecurity.ts). This file is the
 * canonical TypeScript implementation both copies must match.
 */

export type OwnershipCheck = { ok: true } | { ok: false; reason: 'not_found' }

export async function verifyContractOwnership(
  supabase: SupabaseClient<Database>,
  contractId: string,
  userId: string
): Promise<OwnershipCheck> {
  const { data, error } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', contractId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, reason: 'not_found' }
  }
  return { ok: true }
}

export async function verifySessionOwnership(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  userId: string
): Promise<OwnershipCheck> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, reason: 'not_found' }
  }
  return { ok: true }
}

/**
 * Chat is only meaningful once extraction has produced grounded content to
 * answer from — gate entry at the ownership-check layer too, not just the
 * UI (docs/specs/06-contract-chat-spec.md §9: "Contract still processing").
 */
export async function verifyContractReadyForChat(
  supabase: SupabaseClient<Database>,
  contractId: string,
  userId: string
): Promise<OwnershipCheck & { status?: string }> {
  const { data, error } = await supabase
    .from('contracts')
    .select('id, status')
    .eq('id', contractId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, reason: 'not_found' }
  }
  if (data.status !== 'completed') {
    return { ok: false, reason: 'not_found', status: data.status }
  }
  return { ok: true }
}
