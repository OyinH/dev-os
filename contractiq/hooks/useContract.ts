import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface Contract {
  id: string
  user_id: string
  title: string
  contract_type: 'NDA' | 'MSA'
  detected_contract_type: 'NDA' | 'MSA' | null
  file_path: string | null
  contract_text: string
  page_count: number
  token_count: number | null
  status: 'processing' | 'completed' | 'error'
  error_message: string | null
  created_at: string
  updated_at: string
}

export function useContract(contractId: string) {
  return useQuery({
    queryKey: ['contract', contractId],
    queryFn: async (): Promise<Contract> => {
      const supabase = createClient()
      const { data, error } = await supabase.from('contracts').select('*').eq('id', contractId).single<Contract>()
      if (error) throw error
      return data
    },
  })
}
