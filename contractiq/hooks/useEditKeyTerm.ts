import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/stores/toastStore'
import type { KeyTerm, CustomKeyTerm } from './useKeyTerms'

type TermTable = 'key_terms' | 'custom_key_terms'

interface EditTermInput {
  contractId: string
  termId: string
  termTable: TermTable
  newValue: string
}

interface EditTermResponse {
  term_id: string
  value: string
  is_edited: boolean
  original_ai_value: string | null
}

type KeyTermsData = { standard: KeyTerm[]; custom: CustomKeyTerm[] }

function applyOptimisticEdit(old: KeyTermsData | undefined, input: EditTermInput): KeyTermsData | undefined {
  if (!old) return old
  const key = input.termTable === 'key_terms' ? 'standard' : 'custom'
  return {
    ...old,
    [key]: old[key].map((term) =>
      term.id === input.termId ? { ...term, value: input.newValue, is_edited: true } : term
    ),
  }
}

export function useEditKeyTerm(contractId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: EditTermInput) => {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke<EditTermResponse>('edit-key-term', {
        body: {
          contract_id: input.contractId,
          term_id: input.termId,
          term_table: input.termTable,
          new_value: input.newValue,
        },
      })
      if (error || !data) throw new Error('Could not save your edit.')
      return data
    },
    onMutate: async (input: EditTermInput) => {
      await queryClient.cancelQueries({ queryKey: ['key-terms', contractId] })
      const previous = queryClient.getQueryData<KeyTermsData>(['key-terms', contractId])
      queryClient.setQueryData<KeyTermsData>(['key-terms', contractId], (old) => applyOptimisticEdit(old, input))
      return { previous }
    },
    onError: (_err, _input, context) => {
      queryClient.setQueryData(['key-terms', contractId], context?.previous)
      toast.error('Could not save your edit. Please try again.')
    },
  })
}
