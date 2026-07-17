'use client'

import { usePanelUiStore } from '@/lib/stores/panelUiStore'

export function PageCitationChip({ page }: { page: number }) {
  const setTargetPage = usePanelUiStore((s) => s.setTargetPage)

  return (
    <button
      type="button"
      onClick={() => setTargetPage(page)}
      className="rounded-badge border border-brand px-xs py-[1px] text-small text-brand hover:bg-accent-light"
    >
      Page {page}
    </button>
  )
}
