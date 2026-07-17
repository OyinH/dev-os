# Spec 04 — Custom Key Term Addition

**Maps to:** US-005, FR-05
**Depends on:** `custom_key_terms` table + `enforce_custom_term_limit` trigger (`docs/specs/supabase-schema.sql`), Spec 03 (`process-contract` bundles custom terms into the same extraction call)

---

## 1. User Flow

1. During the pre-processing preview step (after Spec 02, before "Process Contract"), user clicks "+ Add Key Term"
2. Types a custom term name (e.g. "Non-compete radius")
3. Term appears in the preview list with a "Custom" badge
4. Up to 5 custom terms allowed; the "+ Add Key Term" control disables past the 5th
5. On "Process Contract," custom term names travel inside the same `process-contract` request payload (`custom_terms: string[]`) — **not** a separate API call

## 2. No dedicated API route

Custom term names are a field on the Spec 03 request (`process-contract`), per the PRD's prompt strategy: "Custom terms are appended to the standard term list passed to the model." This avoids a second OpenAI call.

## 3. Client-side validation (`CustomTermInput`)

```ts
function validateCustomTerm(
  name: string,
  existingCustomTerms: string[],
  standardTerms: readonly string[]
): { valid: true } | { valid: false; error: string } {
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
```

## 4. State Management

- Zustand `uploadWizardStore.customTerms: string[]` (≤5) — pure client state until `process-contract` is invoked; no DB interaction happens while the user is adding/removing terms in the wizard
- Results land in the same `['key-terms', contract_id]` query as standard terms (Spec 03) — no separate query key

## 5. Component Spec

| Component | Responsibility |
|---|---|
| `CustomTermInput` | Text input + "Add" button; runs `validateCustomTerm` inline, disables past 5 terms |
| `CustomTermBadge` | Small "Custom" tag, shown on `TermPreviewList` rows and later on `KeyTermCard` rows where `is_manual = true` |

## 6. Design

"Custom" badge: Violet family (`--color-violet-500` text / `--color-violet-50` bg), 4px radius — deliberately a different hue from the Green/Amber/Red confidence semantics and from the Blue "Edited" badge (Spec 08), so the three badge types are never visually confused.

## 7. Server-side backstop

Even though the UI disables the input past 5 terms, `process-contract` also relies on the DB trigger `enforce_custom_term_limit` (before insert on `custom_key_terms`) as a server-side backstop independent of client-side limiting — see `docs/specs/supabase-schema.sql`. If `process-contract` somehow receives >5 custom terms (bypassed client validation, direct API call), it returns `422 invalid_custom_term_count` before even calling OpenAI (see Spec 03 §5).

## 8. Edge Cases

| Case | Behavior |
|---|---|
| 6th custom term attempted | Input disabled client-side; if bypassed via direct API call, `process-contract` returns `422` before the DB trigger is even reached |
| Empty/whitespace-only name | Rejected client-side, never added to the list |
| Duplicate name (case-insensitive vs. another custom term or a standard term for that contract type) | Rejected with inline message — avoids ambiguous duplicate rows in the results panel |
| Custom term yields low/no confidence | Same treatment as a low-confidence standard term (red badge, non-dismissible warning) — never silently dropped |
| User removes a custom term before processing | Removed from the Zustand array only; no DB interaction has happened yet |

## 9. Acceptance Criteria (US-005)

- [ ] Custom terms appear in the pre-processing preview with a "Custom" badge
- [ ] A 6th custom term cannot be added via the UI
- [ ] Processed results include custom-term extraction with the identical data structure as standard terms (value, page, confidence, source sentence)
- [ ] Duplicate term names (case-insensitive, vs. standard or custom terms) are rejected before being added
