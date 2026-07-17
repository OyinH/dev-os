# Spec 13 — Standard Terms Constants & Design Token Mapping

**Used by:** Spec 02 (term preview), Spec 03 (extraction target list), Spec 04 (duplicate-name validation), all UI components
**Files:** `lib/constants/standard-terms.ts`, `tailwind.config.ts`

---

## 1. `lib/constants/standard-terms.ts`

Single source of truth for the standard term lists, shared by the pre-processing preview (client, instant render, no round trip) and referenced by name in the extraction prompts (Spec 03). **Must stay in sync with `NDA_STANDARD_TERMS`/`MSA_STANDARD_TERMS` in the Edge Function prompt files** — duplicated intentionally (Deno Edge Functions and the Next.js app do not share a module boundary), not derived from a single import.

```ts
export const NDA_TERMS = [
  'Parties',
  'Effective Date',
  'Confidentiality Obligations',
  'Permitted Disclosures',
  'Term & Duration',
  'Governing Law',
  'Jurisdiction',
  'IP Ownership',
  'Non-Solicitation',
  'Breach & Remedy',
] as const

export const MSA_TERMS = [
  'Parties',
  'Service Scope',
  'Payment Terms',
  'Invoice Schedule',
  'Late Payment Penalty',
  'Liability Cap',
  'Indemnification',
  'IP Ownership',
  'Termination Clause',
  'Governing Law',
  'Dispute Resolution',
  'Notice Period',
] as const

export type NdaTermName = (typeof NDA_TERMS)[number]
export type MsaTermName = (typeof MSA_TERMS)[number]

export function standardTermsFor(contractType: 'NDA' | 'MSA'): readonly string[] {
  return contractType === 'NDA' ? NDA_TERMS : MSA_TERMS
}

export const MAX_CUSTOM_TERMS = 5
export const CUSTOM_TERM_MAX_LENGTH = 100
export const LOW_CONFIDENCE_THRESHOLD = 50
export const MEDIUM_CONFIDENCE_THRESHOLD = 80
```

## 2. `tailwind.config.ts` — design token mapping

Maps `docs/design.md`'s CSS custom properties (already defined in `styles/globals.css`, see below) into Tailwind's theme so components use `bg-brand`, `text-primary`, etc. instead of raw hex values.

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        grey: {
          25: 'var(--color-grey-25)', 50: 'var(--color-grey-50)', 100: 'var(--color-grey-100)',
          200: 'var(--color-grey-200)', 300: 'var(--color-grey-300)', 400: 'var(--color-grey-400)',
          500: 'var(--color-grey-500)', 600: 'var(--color-grey-600)', 700: 'var(--color-grey-700)',
          800: 'var(--color-grey-800)', 900: 'var(--color-grey-900)',
        },
        blue: {
          50: 'var(--color-blue-50)', 100: 'var(--color-blue-100)', 200: 'var(--color-blue-200)',
          300: 'var(--color-blue-300)', 400: 'var(--color-blue-400)', 500: 'var(--color-blue-500)',
          600: 'var(--color-blue-600)', 700: 'var(--color-blue-700)', 800: 'var(--color-blue-800)',
          900: 'var(--color-blue-900)',
        },
        green: {
          50: 'var(--color-green-50)', 100: 'var(--color-green-100)', 200: 'var(--color-green-200)',
          500: 'var(--color-green-500)', 700: 'var(--color-green-700)', 900: 'var(--color-green-900)',
        },
        red: {
          50: 'var(--color-red-50)', 100: 'var(--color-red-100)', 200: 'var(--color-red-200)',
          500: 'var(--color-red-500)', 700: 'var(--color-red-700)', 900: 'var(--color-red-900)',
        },
        yellow: {
          50: 'var(--color-yellow-50)', 100: 'var(--color-yellow-100)', 200: 'var(--color-yellow-200)',
          500: 'var(--color-yellow-500)', 700: 'var(--color-yellow-700)',
        },
        violet: {
          50: 'var(--color-violet-50)', 100: 'var(--color-violet-100)', 200: 'var(--color-violet-200)',
          500: 'var(--color-violet-500)', 700: 'var(--color-violet-700)',
        },
        brand: 'var(--brand)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'bg-surface': 'var(--bg-surface)',
        'bg-subtle': 'var(--bg-subtle)',
      },
      spacing: {
        1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)', 4: 'var(--space-4)',
        6: 'var(--space-6)', 8: 'var(--space-8)', 10: 'var(--space-10)', 12: 'var(--space-12)',
        16: 'var(--space-16)', 24: 'var(--space-24)', 28: 'var(--space-28)',
      },
      fontFamily: {
        sans: ['Inter Display', 'sans-serif'],
      },
      borderRadius: {
        badge: '4px',
        control: '6px',
        card: '8px',
        modal: '12px',
      },
    },
  },
  plugins: [],
}

export default config
```

## 3. `styles/globals.css` — CSS custom properties

Paste the full `:root { ... }` block from `docs/design.md`'s "Implementation Guidance → CSS Custom Properties Setup" section verbatim, above the `@tailwind` directives:

```css
:root {
  /* ...full primitive + semantic token block from docs/design.md lines 441–549... */
}

@tailwind base;
@tailwind components;
@tailwind utilities;
```

This file is intentionally not re-transcribed here in full — `docs/design.md` is the single source of truth for token *values*; copy it verbatim rather than retyping, to avoid the two files drifting.

## 4. Confidence color mapping (used by `ConfidenceBadge`, Spec 03)

```ts
export function confidenceColor(score: number): 'green' | 'yellow' | 'red' {
  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return 'green'
  if (score >= LOW_CONFIDENCE_THRESHOLD) return 'yellow'
  return 'red'
}
```

| Range | Tailwind classes |
|---|---|
| ≥80 | `bg-green-50 border-green-200 text-green-700` |
| 50–79 | `bg-yellow-50 border-yellow-200 text-yellow-700` |
| <50 | `bg-red-50 border-red-200 text-red-700` |

## 5. Acceptance Criteria

- [ ] `NDA_TERMS` has exactly 10 entries, `MSA_TERMS` has exactly 12, matching the PRD term lists verbatim
- [ ] The pre-processing preview (Spec 02) renders from `standardTermsFor()` with zero network calls
- [ ] Every hardcoded hex color from `docs/design.md` is available as a Tailwind token — no component should need a raw hex value
