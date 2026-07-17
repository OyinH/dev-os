// Per docs/specs/04-custom-key-terms-spec.md §3. Server-side backstop lives
// in process-contract's isValidRequestBody + the enforce_custom_term_limit
// DB trigger — this is the client-side layer for inline UX feedback only.

export type ValidateCustomTermResult = { valid: true } | { valid: false; error: string }

export function validateCustomTerm(
  name: string,
  existingCustomTerms: string[],
  standardTerms: readonly string[]
): ValidateCustomTermResult {
  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Term name cannot be empty.' }
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Term name must be 100 characters or fewer.' }
  }

  const normalized = trimmed.toLowerCase()
  const isDuplicate =
    existingCustomTerms.some((t) => t.toLowerCase() === normalized) ||
    standardTerms.some((t) => t.toLowerCase() === normalized)

  if (isDuplicate) {
    return { valid: false, error: 'This term is already in the list.' }
  }

  return { valid: true }
}
