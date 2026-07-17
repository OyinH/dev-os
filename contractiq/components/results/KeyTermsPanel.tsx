import type { KeyTerm, CustomKeyTerm } from '@/hooks/useKeyTerms'
import { KeyTermCard } from './KeyTermCard'

export function KeyTermsPanel({
  contractId,
  standard,
  custom,
  maxPage,
}: {
  contractId: string
  standard: KeyTerm[]
  custom: CustomKeyTerm[]
  maxPage: number
}) {
  if (standard.length === 0 && custom.length === 0) {
    return <p className="text-body text-text-muted">No key terms were extracted for this contract.</p>
  }

  return (
    <div className="flex flex-col gap-sm">
      {standard.map((term) => (
        <KeyTermCard key={term.id} term={term} maxPage={maxPage} contractId={contractId} />
      ))}
      {custom.map((term) => (
        <KeyTermCard key={term.id} term={term} maxPage={maxPage} contractId={contractId} isCustom />
      ))}
    </div>
  )
}
