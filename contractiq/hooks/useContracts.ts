import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface ContractListItem {
  id: string
  title: string
  contract_type: 'NDA' | 'MSA'
  status: 'processing' | 'completed' | 'error'
  created_at: string
}

export function useContracts() {
  return useQuery({
    queryKey: ['contracts'],
    queryFn: async (): Promise<ContractListItem[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contracts')
        .select('id, title, contract_type, status, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// Client-side aggregation over the same query result, acceptable at MVP
// scale (≤200 contracts per PRD Assumption 4).
export function summarizeContracts(contracts: { contract_type: string }[]) {
  return {
    total: contracts.length,
    byType: contracts.reduce<Record<string, number>>((acc, c) => {
      acc[c.contract_type] = (acc[c.contract_type] ?? 0) + 1
      return acc
    }, {}),
  }
}
