import { z } from 'zod'
import { MAX_CHAT_MESSAGE_LENGTH, MAX_CUSTOM_TERMS, CUSTOM_TERM_MAX_LENGTH, MAX_FILE_SIZE_BYTES } from './tokenLimiter'

// ============================================================================
// Zod schemas — request validation for every mutation in the app.
//
// Reused by:
// - app/api/auth/login/route.ts (authSchema)
// - Stage 5 Next.js mutation callers, as the client-side shape check before
//   invoking each Supabase Edge Function
// - The canonical reference for the Deno-side re-validation inside each
//   Edge Function (supabase/functions/*/index.ts), which cannot import this
//   file directly (different runtime) but must enforce the same shape.
// ============================================================================

export const authSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

export const uploadContractRequestSchema = z.object({
  contract_type: z.enum(['NDA', 'MSA']),
  filename: z.string().min(1).max(255),
})

export const processContractRequestSchema = z.object({
  contract_id: z.string().uuid(),
  contract_type: z.enum(['NDA', 'MSA']),
  custom_terms: z
    .array(z.string().trim().min(1).max(CUSTOM_TERM_MAX_LENGTH))
    .max(MAX_CUSTOM_TERMS, `A maximum of ${MAX_CUSTOM_TERMS} custom terms is allowed.`)
    .optional(),
})

export const editKeyTermRequestSchema = z.object({
  contract_id: z.string().uuid(),
  term_id: z.string().uuid(),
  term_table: z.enum(['key_terms', 'custom_key_terms']),
  new_value: z.string(), // empty string is a valid edit — see docs/specs/08-inline-editing-spec.md §6
})

export const chatMessageRequestSchema = z.object({
  contract_id: z.string().uuid(),
  session_id: z.string().uuid().nullish(),
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty.')
    .max(MAX_CHAT_MESSAGE_LENGTH, `Messages must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer.`),
})

export const submitFeedbackRequestSchema = z.object({
  contract_id: z.string().uuid(),
  rating: z.enum(['up', 'down']),
  comment: z.string().max(1000).optional(),
})

export const deleteContractRequestSchema = z.object({
  contract_id: z.string().uuid(),
})

// ============================================================================
// File upload validation
//
// Deviation from the generic security-foundation template: this project's
// approved scope (docs/ContractIQ_PRD.md, docs/specs/02-upload-extract-text-spec.md)
// is PDF-only for NDA/MSA contracts. DOCX is intentionally NOT allowed here
// even though the generic skill template lists it — adding it would silently
// expand scope beyond what Stage 1/2 approved.
// ============================================================================

const ALLOWED_EXTENSIONS = ['.pdf']
const ALLOWED_MIME_TYPES = ['application/pdf']

const BLOCKED_EXTENSIONS = [
  '.exe', '.js', '.mjs', '.cjs', '.php', '.zip',
  '.sh', '.bat', '.cmd', '.py', '.rb', '.ps1',
]

export interface FileValidationResult {
  valid: boolean
  error?: { code: string; message: string }
}

/**
 * Validates in the required order: extension (blocklist, then allowlist) →
 * MIME type → file size. Used both client-side (FileDropzone, for instant
 * feedback) and as the reference for the Deno re-validation inside
 * upload-extract-text (server-side validation is authoritative — client-side
 * checks are UX only and must never be trusted alone).
 */
export function validateFileUpload(file: { name: string; type: string; size: number }): FileValidationResult {
  const lowerName = file.name.toLowerCase()
  const extension = lowerName.slice(lowerName.lastIndexOf('.'))

  if (BLOCKED_EXTENSIONS.includes(extension)) {
    return { valid: false, error: { code: 'blocked_file_type', message: 'This file type is not allowed.' } }
  }
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { valid: false, error: { code: 'invalid_file_type', message: 'Only PDF files are supported.' } }
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: { code: 'invalid_file_type', message: 'Only PDF files are supported.' } }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: { code: 'file_too_large', message: 'File exceeds the 10MB limit.' } }
  }

  return { valid: true }
}
