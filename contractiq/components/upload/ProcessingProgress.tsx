'use client'

const STEPS = [
  { key: 1, label: 'Extracting text' },
  { key: 2, label: 'Analyzing contract' },
  { key: 3, label: 'Compiling results' },
] as const

export function ProcessingProgress({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <ol className="flex flex-col gap-sm">
      {STEPS.map((step) => {
        const done = step.key < currentStep
        const active = step.key === currentStep

        return (
          <li key={step.key} className="flex items-center gap-sm">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-small font-medium ${
                done
                  ? 'bg-success text-white'
                  : active
                    ? 'border-2 border-brand text-brand'
                    : 'border border-border-strong text-text-muted'
              }`}
            >
              {done ? '✓' : step.key}
            </span>
            <span className={active ? 'text-body-lg text-text-primary' : 'text-body text-text-muted'}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
