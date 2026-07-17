import { summarizeContracts, type ContractListItem } from '@/hooks/useContracts'

export function SummaryCards({ contracts }: { contracts: ContractListItem[] }) {
  const { total, byType } = summarizeContracts(contracts)

  const cards = [
    { label: 'Total contracts', value: total },
    { label: 'NDA', value: byType.NDA ?? 0 },
    { label: 'MSA', value: byType.MSA ?? 0 },
  ]

  return (
    <div className="flex gap-md">
      {cards.map((card) => (
        <div key={card.label} className="flex-1 rounded-card border border-border bg-surface-elevated p-lg">
          <div className="text-h1 text-text-primary">{card.value}</div>
          <div className="text-body text-text-secondary">{card.label}</div>
        </div>
      ))}
    </div>
  )
}
