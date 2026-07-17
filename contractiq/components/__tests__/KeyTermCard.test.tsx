import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { KeyTermCard } from '../results/KeyTermCard'
import type { KeyTerm } from '@/hooks/useKeyTerms'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient()
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function makeTerm(overrides: Partial<KeyTerm> = {}): KeyTerm {
  return {
    id: 'term-1',
    contract_id: 'contract-1',
    term_name: 'Effective Date',
    value: 'January 1, 2026',
    page_number: 1,
    confidence_score: 90,
    source_sentence: 'This Agreement is effective January 1, 2026.',
    is_edited: false,
    display_order: 0,
    ...overrides,
  }
}

describe('KeyTermCard', () => {
  it('renders a success-coloured confidence badge for high confidence', () => {
    renderWithClient(<KeyTermCard term={makeTerm({ confidence_score: 95 })} maxPage={1} contractId="contract-1" />)
    expect(screen.getByText('95%')).toHaveClass('bg-success/10', 'text-success')
  })

  it('renders an error-coloured confidence badge for low confidence', () => {
    renderWithClient(<KeyTermCard term={makeTerm({ confidence_score: 30 })} maxPage={1} contractId="contract-1" />)
    expect(screen.getByText('30%')).toHaveClass('bg-error/10', 'text-error')
  })

  it('shows a non-dismissible low-confidence warning below the threshold', () => {
    renderWithClient(<KeyTermCard term={makeTerm({ confidence_score: 40 })} maxPage={1} contractId="contract-1" />)
    const warning = screen.getByLabelText('Low confidence warning')
    expect(warning).toBeInTheDocument()
    // Non-dismissible: no close/dismiss button rendered alongside it.
    expect(screen.queryByRole('button', { name: /dismiss|close/i })).not.toBeInTheDocument()
  })

  it('does not show the low-confidence warning at or above the threshold', () => {
    renderWithClient(<KeyTermCard term={makeTerm({ confidence_score: 50 })} maxPage={1} contractId="contract-1" />)
    expect(screen.queryByLabelText('Low confidence warning')).not.toBeInTheDocument()
  })
})
