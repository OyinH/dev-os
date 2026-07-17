import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/stores/toastStore'

export interface Feedback {
  contract_id: string
  user_id: string
  rating: 'up' | 'down'
  comment: string | null
  created_at: string
}

interface SubmitFeedbackInput {
  contract_id: string
  rating: 'up' | 'down'
  comment?: string
}

export function useFeedback(contractId: string) {
  return useQuery({
    queryKey: ['feedback', contractId],
    queryFn: async (): Promise<Feedback | null> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .eq('contract_id', contractId)
        .maybeSingle<Feedback>()
      if (error) throw error
      return data
    },
  })
}

export function useSubmitFeedback() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SubmitFeedbackInput) => {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke<Feedback>('submit-feedback', { body: input })
      if (error || !data) throw new Error('Could not submit feedback.')
      return data
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['feedback', variables.contract_id], data)
      toast.success('Thanks for your feedback.')
    },
    onError: () => {
      toast.error('Could not submit feedback. Please try again.')
    },
  })
}
