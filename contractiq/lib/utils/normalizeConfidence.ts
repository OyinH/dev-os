// Canonical implementation. Mirrored (duplicated by necessity across the
// Deno/Node runtime boundary, same pattern as NDA_TERMS/MSA_TERMS) in
// supabase/functions/process-contract/index.ts, the actual call site at
// runtime since OpenAI calls only happen inside Edge Functions.

export function normalizeConfidence(raw: number): number {
  // Model returns 0.0-1.0; persisted column is 0-100.
  const clamped = Math.max(0, Math.min(1, raw))
  return Math.round(clamped * 100 * 100) / 100 // 2 decimal places, matches numeric(5,2)
}
