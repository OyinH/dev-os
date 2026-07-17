'use client'

import { standardTermsFor } from '@/lib/constants/standard-terms'
import { CustomTermBadge } from './CustomTermBadge'
import { CustomTermInput } from './CustomTermInput'

export function TermPreviewList({
  contractType,
  customTerms,
  onAddCustomTerm,
  onRemoveCustomTerm,
}: {
  contractType: 'NDA' | 'MSA'
  customTerms: string[]
  onAddCustomTerm: (term: string) => void
  onRemoveCustomTerm: (term: string) => void
}) {
  const standardTerms = standardTermsFor(contractType)

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <p className="text-body text-text-secondary">Terms we&apos;ll extract:</p>
        <ul className="flex flex-col gap-xs">
          {standardTerms.map((term) => (
            <li key={term} className="text-body-lg text-text-primary">
              {term}
            </li>
          ))}
          {customTerms.map((term) => (
            <li key={term} className="flex items-center gap-xs">
              <span className="text-body-lg text-text-primary">{term}</span>
              <CustomTermBadge />
              <button
                type="button"
                onClick={() => onRemoveCustomTerm(term)}
                className="text-small text-text-muted hover:text-error"
                aria-label={`Remove ${term}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <CustomTermInput existingCustomTerms={customTerms} standardTerms={standardTerms} onAdd={onAddCustomTerm} />
    </div>
  )
}
