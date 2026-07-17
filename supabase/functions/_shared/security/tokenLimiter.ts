// Deno mirror of the chat-relevant constants in
// contractiq/lib/security/tokenLimiter.ts (canonical). Kept minimal — only
// what chat-message actually enforces at runtime.

export const MAX_CHAT_MESSAGE_LENGTH = 5000
export const MAX_CHAT_HISTORY = Number(Deno.env.get('MAX_CHAT_HISTORY') ?? 200)

export interface LimitCheckResult {
  valid: boolean
  reason?: string
}

export function checkChatMessageLength(message: string): LimitCheckResult {
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    return { valid: false, reason: `Messages must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer.` }
  }
  return { valid: true }
}
