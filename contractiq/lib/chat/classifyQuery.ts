// Canonical implementation. Mirrored in
// supabase/functions/_shared/classify-query.ts, the actual call site at
// runtime (chat-message Edge Function) since Deno cannot import Next.js
// modules across the runtime boundary.

export type QueryClassification = 'contract' | 'history' | 'both'

const HISTORY_KEYWORDS = [
  'earlier',
  'you said',
  'before',
  'previously',
  'last time',
  'what did you say',
  'again',
  'that answer',
  'above',
  'asked you',
  'you asked',
  'recap',
]

// Substring keywords miss natural phrasing like "what have I asked" (no
// "you") or "the questions I've asked" — these catch the meta-conversation
// intent regardless of exact wording around it.
const HISTORY_PATTERNS = [
  /\bwhat (have|did) i (ask|say)/i,
  /\bquestions? i(?:'ve| have)? asked\b/i,
  /\b(this|our) conversation\b/i,
]

export function classifyQuery(message: string): QueryClassification {
  const lower = message.toLowerCase()
  const hasHistorySignal =
    HISTORY_KEYWORDS.some((kw) => lower.includes(kw)) || HISTORY_PATTERNS.some((re) => re.test(lower))
  const hasContractSignal = /clause|term|agreement|contract|page|section|provision/.test(lower)

  if (hasHistorySignal && hasContractSignal) return 'both'
  if (hasHistorySignal) return 'history'
  return 'contract'
}
