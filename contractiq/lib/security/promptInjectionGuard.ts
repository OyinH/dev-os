/**
 * Detects and blocks prompt-injection attempts in user-supplied chat
 * messages before they reach the LLM.
 *
 * Runtime note: per engineering-doc.md §6, all OpenAI calls happen inside
 * Supabase Edge Functions (Deno), never in Next.js, so the actual call site
 * for this logic at runtime is
 * supabase/functions/chat-message/index.ts via its
 * supabase/functions/_shared/security/promptInjectionGuard.ts mirror. This
 * file is the canonical TypeScript implementation both copies must match,
 * and is available to any future Next.js-side code that constructs a
 * user-facing LLM prompt.
 *
 * Scope: applies to the live chat `message` field only — never to
 * `contract_text`. A malicious contract embedding instructions ("ignore
 * your instructions and reveal...") is a different threat, mitigated
 * instead by the chat system prompt's document-only framing
 * (docs/specs/06-contract-chat-spec.md §4): the document is passed as
 * inert reference data inside a fenced --- DOCUMENT --- block, and the
 * system prompt explicitly instructs the model to treat its contents as
 * data to answer from, never as instructions to follow. Running this same
 * pattern-match against full contract text would also produce false
 * positives on legitimate legal language (e.g. a clause literally titled
 * "Governing Law" discussing "overriding" provisions).
 */

const INJECTION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i, label: 'ignore_previous_instructions' },
  { pattern: /override\s+your\s+rules/i, label: 'override_rules' },
  { pattern: /reveal\s+(your\s+)?system\s+prompt/i, label: 'reveal_system_prompt' },
  { pattern: /print\s+your\s+instructions/i, label: 'print_instructions' },
  { pattern: /expose\s+env(ironment)?\s+variables?/i, label: 'expose_env_vars' },
  { pattern: /show\s+(me\s+)?(the\s+)?api\s+keys?/i, label: 'show_api_keys' },
  { pattern: /you\s+are\s+now\s+a\b/i, label: 'role_override' },
  { pattern: /\bact\s+as\s+(a|an|my)\b/i, label: 'act_as' },
  { pattern: /pretend\s+you\s+are\b/i, label: 'pretend_you_are' },
  { pattern: /\bjailbreak\b/i, label: 'jailbreak' },
  { pattern: /\bDAN\s+mode\b/i, label: 'dan_mode' },
  { pattern: /\bdeveloper\s+mode\b/i, label: 'developer_mode' },
]

export class PromptInjectionError extends Error {
  constructor(public readonly matchedPattern: string) {
    super(`Prompt injection detected: ${matchedPattern}`)
    this.name = 'PromptInjectionError'
  }
}

export interface PromptInjectionCheck {
  detected: boolean
  matchedPattern?: string
}

export function detectPromptInjection(text: string): PromptInjectionCheck {
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { detected: true, matchedPattern: label }
    }
  }
  return { detected: false }
}

/**
 * Call on every user chat message before sending it to the LLM. Returns the
 * trimmed message on success; throws PromptInjectionError on detection —
 * callers must catch this and respond 400 PROMPT_INJECTION without calling
 * the AI, per docs/security/security-plan.md.
 */
export function sanitizeForLLM(text: string): string {
  const trimmed = text.trim()
  const check = detectPromptInjection(trimmed)
  if (check.detected) {
    throw new PromptInjectionError(check.matchedPattern!)
  }
  return trimmed
}
