'use client'

import { useEffect, useRef } from 'react'

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Finds `sentence` within `pageText`, tolerating whitespace drift from PDF
// text extraction (collapsed/expanded spacing, wrapped lines). Returns the
// match's actual span in `pageText` (not the sentence's own length) so the
// rendered highlight lines up with the real text, or null if no match —
// callers fall back to a page-level border highlight only, never a crash.
function findHighlightRange(pageText: string, sentence: string): { start: number; end: number } | null {
  const pattern = escapeRegExp(sentence.trim()).replace(/\s+/g, '\\s+')
  const match = new RegExp(pattern, 'i').exec(pageText)
  if (!match) return null
  return { start: match.index, end: match.index + match[0].length }
}

export function TextPage({
  pageNumber,
  text,
  isTarget,
  targetSentence,
}: {
  pageNumber: number
  text: string
  isTarget: boolean
  targetSentence: string | null
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isTarget) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [isTarget])

  const range = isTarget && targetSentence ? findHighlightRange(text, targetSentence) : null

  return (
    <div
      ref={ref}
      className={`rounded-card border p-md transition-colors duration-150 ease-out ${
        isTarget ? 'border-brand' : 'border-border'
      }`}
    >
      <p className="mb-xs text-small text-text-muted">Page {pageNumber}</p>
      <p className="whitespace-pre-wrap text-body text-text-primary">
        {range ? (
          <>
            {text.slice(0, range.start)}
            <mark className="bg-accent-light">{text.slice(range.start, range.end)}</mark>
            {text.slice(range.end)}
          </>
        ) : (
          text
        )}
      </p>
    </div>
  )
}
