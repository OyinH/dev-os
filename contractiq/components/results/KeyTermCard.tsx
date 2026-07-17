import type { KeyTerm } from '@/hooks/useKeyTerms'
import { ConfidenceBadge } from './ConfidenceBadge'
import { LowConfidenceWarning } from './LowConfidenceWarning'
import { PageRefButton } from './PageRefButton'
import { WhySection } from './WhySection'
import { TermValueEditable } from './TermValueEditable'
import { CustomTermBadge } from '@/components/upload/CustomTermBadge'
import { LOW_CONFIDENCE_THRESHOLD } from '@/lib/constants/standard-terms'

export function KeyTermCard({
  term,
  maxPage,
  isCustom,
  contractId,
}: {
  term: KeyTerm
  maxPage: number
  isCustom?: boolean
  contractId: string
}) {
  const lowConfidence = (term.confidence_score ?? 0) < LOW_CONFIDENCE_THRESHOLD

  return (
    <div className="rounded-card border border-border bg-surface-elevated p-md">
      <div className="flex items-start justify-between gap-sm">
        <div className="flex items-center gap-xs">
          <span className="text-body-lg font-medium text-text-primary">{term.term_name}</span>
          {isCustom && <CustomTermBadge />}
          {term.is_edited && (
            <span className="rounded-badge border border-blue px-xs py-[1px] text-small text-blue">Edited</span>
          )}
        </div>
        <div className="flex items-center gap-xs">
          {lowConfidence && <LowConfidenceWarning />}
          {term.confidence_score !== null && <ConfidenceBadge score={term.confidence_score} />}
        </div>
      </div>

      <TermValueEditable
        contractId={contractId}
        termId={term.id}
        termTable={isCustom ? 'custom_key_terms' : 'key_terms'}
        value={term.value}
      />

      <div className="mt-sm flex items-center justify-between">
        <PageRefButton pageNumber={term.page_number} maxPage={maxPage} sourceSentence={term.source_sentence} />
        <WhySection sourceSentence={term.source_sentence} />
      </div>
    </div>
  )
}
