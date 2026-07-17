import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface KeyTerm {
  id: string
  contract_id: string
  term_name: string
  value: string | null
  page_number: number | null
  confidence_score: number | null
  source_sentence: string | null
  is_edited: boolean
  display_order: number | null
}

export interface CustomKeyTerm extends KeyTerm {
  is_manual: boolean
}

export function useKeyTerms(contractId: string) {
  return useQuery({
    queryKey: ['key-terms', contractId],
    queryFn: async (): Promise<{ standard: KeyTerm[]; custom: CustomKeyTerm[] }> => {
      const supabase = createClient()
      const [standard, custom] = await Promise.all([
        supabase.from('key_terms').select('*').eq('contract_id', contractId).order('display_order').returns<KeyTerm[]>(),
        supabase
          .from('custom_key_terms')
          .select('*')
          .eq('contract_id', contractId)
          .order('display_order')
          .returns<CustomKeyTerm[]>(),
      ])
      if (standard.error) throw standard.error
      if (custom.error) throw custom.error
      return { standard: standard.data, custom: custom.data }
    },
  })
}
