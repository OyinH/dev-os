import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TermValueEditable } from '../results/TermValueEditable'

const invokeMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ functions: { invoke: invokeMock } }),
}))

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient()
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  invokeMock.mockReset()
  invokeMock.mockResolvedValue({ data: { term_id: 'term-1', value: 'x', is_edited: true, original_ai_value: 'y' }, error: null })
})

describe('TermValueEditable', () => {
  it('switches to an editable input when the value is clicked', async () => {
    const user = userEvent.setup()
    renderWithClient(
      <TermValueEditable contractId="contract-1" termId="term-1" termTable="key_terms" value="Original value" />
    )
    await user.click(screen.getByText('Original value'))
    expect(screen.getByDisplayValue('Original value')).toBeInTheDocument()
  })

  it('saves on blur when the value changed', async () => {
    const user = userEvent.setup()
    renderWithClient(
      <TermValueEditable contractId="contract-1" termId="term-1" termTable="key_terms" value="Original value" />
    )
    await user.click(screen.getByText('Original value'))
    const input = screen.getByDisplayValue('Original value')
    await user.clear(input)
    await user.type(input, 'Updated value')
    await user.tab() // blur

    expect(invokeMock).toHaveBeenCalledWith(
      'edit-key-term',
      expect.objectContaining({
        body: expect.objectContaining({ term_id: 'term-1', new_value: 'Updated value' }),
      })
    )
  })

  it('does not call the mutation on blur when the value is unchanged', async () => {
    const user = userEvent.setup()
    renderWithClient(
      <TermValueEditable contractId="contract-1" termId="term-1" termTable="key_terms" value="Original value" />
    )
    await user.click(screen.getByText('Original value'))
    await user.tab() // blur without editing
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
