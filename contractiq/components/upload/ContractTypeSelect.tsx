'use client'

type ContractType = 'NDA' | 'MSA'

const OPTIONS: { value: ContractType; label: string; description: string }[] = [
  { value: 'NDA', label: 'NDA', description: 'Non-Disclosure Agreement' },
  { value: 'MSA', label: 'MSA', description: 'Master Service Agreement' },
]

export function ContractTypeSelect({
  value,
  onChange,
}: {
  value: ContractType | null
  onChange: (value: ContractType) => void
}) {
  return (
    <div className="flex gap-md" role="radiogroup" aria-label="Contract type">
      {OPTIONS.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-card border p-lg text-left transition-colors duration-150 ease-out ${
              selected
                ? 'border-brand bg-accent-light'
                : 'border-border bg-surface-elevated hover:bg-surface-subtle'
            }`}
          >
            <div className="text-h4 text-text-primary">{option.label}</div>
            <div className="text-body text-text-secondary">{option.description}</div>
          </button>
        )
      })}
    </div>
  )
}
