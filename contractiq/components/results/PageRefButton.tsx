'use client'

import { usePanelUiStore } from '@/lib/stores/panelUiStore'

export function PageRefButton({
  pageNumber,
  maxPage,
  sourceSentence,
}: {
  pageNumber: number | null
  maxPage: number
  sourceSentence?: string | null
}) {
  const setTargetPage = usePanelUiStore((s) => s.setTargetPage)

  if (pageNumber === null) return null

  // Term references a page beyond the document — no-op rather than an out-of-range scroll.
  const disabled = pageNumber > maxPage

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setTargetPage(pageNumber, sourceSentence)}
      className="text-small text-brand hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
    >
      Page {pageNumber}
    </button>
  )
}
