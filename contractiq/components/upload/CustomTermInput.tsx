'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { validateCustomTerm } from '@/lib/validation/customTerm'
import { MAX_CUSTOM_TERMS } from '@/lib/constants/standard-terms'

export function CustomTermInput({
  existingCustomTerms,
  standardTerms,
  onAdd,
}: {
  existingCustomTerms: string[]
  standardTerms: readonly string[]
  onAdd: (term: string) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const atLimit = existingCustomTerms.length >= MAX_CUSTOM_TERMS

  function handleAdd() {
    const result = validateCustomTerm(value, existingCustomTerms, standardTerms)
    if (!result.valid) {
      setError(result.error)
      return
    }
    onAdd(value.trim())
    setValue('')
    setError(null)
  }

  if (atLimit) {
    return <p className="text-small text-text-muted">Up to {MAX_CUSTOM_TERMS} custom terms allowed.</p>
  }

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex gap-sm">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="e.g. Non-compete radius"
          aria-label="Custom key term name"
        />
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={value.trim().length === 0}>
          + Add Key Term
        </Button>
      </div>
      {error && <p className="text-small text-error">{error}</p>}
    </div>
  )
}
