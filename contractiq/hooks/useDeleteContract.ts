import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/stores/toastStore'

export function useDeleteContract() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (contractId: string) => {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke<{ success: boolean }>('delete-contract', {
        body: { contract_id: contractId },
      })
      // A second delete on an already-gone contract returns 404 — treat as
      // a no-op success rather than surfacing an error for a stale row.
      if (error && !isNotFound(error)) throw new Error("We couldn't delete this contract. Please try again.")
      return data ?? { success: true }
    },
    onSuccess: (_data, contractId) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.removeQueries({ queryKey: ['contract', contractId] })
      queryClient.removeQueries({ queryKey: ['key-terms', contractId] })
      queryClient.removeQueries({ queryKey: ['feedback', contractId] })
      queryClient.removeQueries({ queryKey: ['chat-messages'] })
      toast.success('Contract deleted.')
    },
    onError: () => {
      toast.error("We couldn't delete this contract. Please try again.")
    },
  })
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'context' in error && (error as { context?: { status?: number } }).context?.status === 404
}
