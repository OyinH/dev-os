/**
 * Contract-processing and chat limits. Values here follow the approved PRD /
 * engineering-doc.md limits (10MB, 20 pages, ~15k tokens, 200-message chat
 * ceiling), not the generic security-foundation template defaults — those
 * generic defaults (200 pages, 100-message history) would silently
 * contradict docs/ContractIQ_PRD.md and docs/specs/03/06.
 *
 * Mirrored in supabase/functions/_shared/security/tokenLimiter.ts (Deno) for
 * enforcement inside upload-extract-text, process-contract, and
 * chat-message — this file is also imported client-side (FileDropzone) for
 * pre-validation feedback before any network call is made.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB, matches the Storage bucket limit
export const MAX_PAGE_COUNT = 20
export const MAX_CONTRACT_TOKENS = 15_000
export const MIN_EXTRACTED_WORDS = 100 // below this, treat as a scanned/image PDF
export const MAX_CHAT_MESSAGE_LENGTH = 5000
export const MAX_CHAT_HISTORY = Number(process.env.MAX_CHAT_HISTORY ?? 200)
export const MAX_CUSTOM_TERMS = 5
export const CUSTOM_TERM_MAX_LENGTH = 100

export interface LimitCheckResult {
  valid: boolean
  reason?: string
}

export function checkFileSize(bytes: number): LimitCheckResult {
  if (bytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, reason: 'File exceeds the 10MB limit.' }
  }
  return { valid: true }
}

export function checkPageCount(pageCount: number): LimitCheckResult {
  if (pageCount > MAX_PAGE_COUNT) {
    return { valid: false, reason: 'Contracts longer than 20 pages are not supported yet.' }
  }
  return { valid: true }
}

export function checkTokenCount(tokenCount: number): LimitCheckResult {
  if (tokenCount > MAX_CONTRACT_TOKENS) {
    return { valid: false, reason: 'This contract is too long for the current version.' }
  }
  return { valid: true }
}

export function checkChatMessageLength(message: string): LimitCheckResult {
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    return { valid: false, reason: `Messages must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer.` }
  }
  return { valid: true }
}
