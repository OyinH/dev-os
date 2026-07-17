import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEditKeyTerm } from '../useEditKeyTerm'
import type { KeyTerm } from '../useKeyTerms'

const invokeMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ functions: { invoke: invokeMock } }),
}))

function makeTerm(overrides: Partial<KeyTerm> = {}): KeyTerm {
  return {
    id: 'term-1',
    contract_id: 'contract-1',
    term_name: 'Term & Duration',
    value: '3 years from the Effective Date',
    page_number: 2,
    confidence_score: 90,
    source_sentence: null,
    is_edited: false,
    display_order: 0,
    ...overrides,
  }
}

function setup() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['key-terms', 'contract-1'], {
    standard: [makeTerm()],
    custom: [],
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

beforeEach(() => {
  invokeMock.mockReset()
})

describe('useEditKeyTerm', () => {
  it('optimistically applies the edit before the request resolves', async () => {
    invokeMock.mockReturnValue(new Promise(() => {})) // never resolves
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useEditKeyTerm('contract-1'), { wrapper })

    result.current.mutate({
      contractId: 'contract-1',
      termId: 'term-1',
      termTable: 'key_terms',
      newValue: '5 years from the Effective Date',
    })

    await waitFor(() => {
      const data = queryClient.getQueryData<{ standard: KeyTerm[] }>(['key-terms', 'contract-1'])
      expect(data?.standard[0].value).toBe('5 years from the Effective Date')
    })
  })

  it('rolls back to the previous value when the save fails', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network error') })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useEditKeyTerm('contract-1'), { wrapper })

    result.current.mutate({
      contractId: 'contract-1',
      termId: 'term-1',
      termTable: 'key_terms',
      newValue: '5 years from the Effective Date',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const data = queryClient.getQueryData<{ standard: KeyTerm[] }>(['key-terms', 'contract-1'])
    expect(data?.standard[0].value).toBe('3 years from the Effective Date')
  })
})
