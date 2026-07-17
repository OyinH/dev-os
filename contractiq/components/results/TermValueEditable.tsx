'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { useEditKeyTerm } from '@/hooks/useEditKeyTerm'

export function TermValueEditable({
  contractId,
  termId,
  termTable,
  value,
}: {
  contractId: string
  termId: string
  termTable: 'key_terms' | 'custom_key_terms'
  value: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const editMutation = useEditKeyTerm(contractId)

  function save() {
    setEditing(false)
    if (draft === (value ?? '')) return
    editMutation.mutate({ contractId, termId, termTable, newValue: draft })
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') {
            setDraft(value ?? '')
            setEditing(false)
          }
        }}
        className="mt-xs"
      />
    )
  }

  return (
    <p
      data-testid="term-value"
      role="button"
      tabIndex={0}
      onClick={() => {
        setDraft(value ?? '')
        setEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setDraft(value ?? '')
          setEditing(true)
        }
      }}
      className="mt-xs cursor-text rounded-input text-body text-text-primary hover:bg-surface-subtle"
    >
      {value || 'Not found'}
    </p>
  )
}
