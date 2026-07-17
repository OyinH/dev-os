'use client'

import { useState } from 'react'

export function WhySection({ sourceSentence }: { sourceSentence: string | null }) {
  const [open, setOpen] = useState(false)

  if (!sourceSentence) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-small text-brand hover:underline"
      >
        {open ? 'Hide source' : 'Why?'}
      </button>
      {open && (
        <p className="mt-xs rounded-badge bg-surface-card p-sm text-small italic text-text-secondary">
          &ldquo;{sourceSentence}&rdquo;
        </p>
      )}
    </div>
  )
}
