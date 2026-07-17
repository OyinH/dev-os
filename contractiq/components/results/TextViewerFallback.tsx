'use client'

import { usePanelUiStore } from '@/lib/stores/panelUiStore'
import { TextPage } from './TextPage'

function parsePages(contractText: string): { pageNumber: number; text: string }[] {
  const parts = contractText.split(/\[PAGE (\d+)\]\n?/).filter((part) => part !== '')
  const pages: { pageNumber: number; text: string }[] = []

  for (let i = 0; i < parts.length; i += 2) {
    const pageNumber = Number(parts[i])
    const text = (parts[i + 1] ?? '').trim()
    if (!Number.isNaN(pageNumber)) pages.push({ pageNumber, text })
  }

  return pages
}

export function TextViewerFallback({ contractText }: { contractText: string }) {
  const targetPage = usePanelUiStore((s) => s.targetPage)
  const targetSentence = usePanelUiStore((s) => s.targetSentence)
  const pages = parsePages(contractText)

  return (
    <div className="flex flex-col gap-md">
      {pages.map((page) => (
        <TextPage
          key={page.pageNumber}
          pageNumber={page.pageNumber}
          text={page.text}
          isTarget={targetPage === page.pageNumber}
          targetSentence={targetPage === page.pageNumber ? targetSentence : null}
        />
      ))}
    </div>
  )
}
