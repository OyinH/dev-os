// Deno mirror of contractiq/lib/security/promptInjectionGuard.ts. That file
// is the canonical implementation; this copy is the one actually invoked at
// runtime by chat-message, since Edge Functions cannot import Next.js
// modules across the runtime boundary. Keep both in sync by hand.

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

// Call on every user chat message before sending it to the LLM. Returns the
// trimmed message on success; throws PromptInjectionError on detection —
// callers must catch this and respond 400 without calling the AI.
export function sanitizeForLLM(text: string): string {
  const trimmed = text.trim()
  const check = detectPromptInjection(trimmed)
  if (check.detected) {
    throw new PromptInjectionError(check.matchedPattern!)
  }
  return trimmed
}
