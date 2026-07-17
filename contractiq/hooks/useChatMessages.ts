import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QueryClassification } from '@/lib/chat/classifyQuery'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  cited_pages: number[]
  created_at: string
  pending?: boolean
  failed?: boolean
  // Which context the answer was drawn from — null for user messages and for
  // assistant rows persisted before this field existed.
  source?: QueryClassification | null
}

interface ChatMessagesData {
  sessionId: string | null
  messages: ChatMessage[]
}

interface ChatMessageResponse {
  message_id: string
  session_id: string
  role: 'assistant'
  content: string
  cited_pages: number[]
  source: QueryClassification
  created_at: string
}

export function useChatMessages(contractId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['chat-messages', contractId],
    enabled,
    queryFn: async (): Promise<ChatMessagesData> => {
      const supabase = createClient()
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('contract_id', contractId)
        .maybeSingle<{ id: string }>()

      if (!session) return { sessionId: null, messages: [] }

      const { data: rows, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, cited_pages, query_classification, created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true })
        .returns<(Omit<ChatMessage, 'source'> & { query_classification: QueryClassification | null })[]>()

      if (error) throw error
      const messages: ChatMessage[] = (rows ?? []).map(({ query_classification, ...rest }) => ({
        ...rest,
        source: query_classification,
      }))
      return { sessionId: session.id, messages }
    },
  })
}

export function useSendChatMessage(contractId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['chat-messages', contractId]

  return useMutation({
    mutationFn: async (message: string) => {
      const current = queryClient.getQueryData<ChatMessagesData>(queryKey)
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke<ChatMessageResponse>('chat-message', {
        body: { contract_id: contractId, session_id: current?.sessionId ?? null, message },
      })
      if (error || !data) throw new Error("We couldn't get a response. Please try again.")
      return data
    },
    onMutate: async (message: string) => {
      await queryClient.cancelQueries({ queryKey })
      const tempId = crypto.randomUUID()
      queryClient.setQueryData<ChatMessagesData>(queryKey, (old) => ({
        sessionId: old?.sessionId ?? null,
        messages: [
          ...(old?.messages ?? []),
          { id: tempId, role: 'user', content: message, cited_pages: [], created_at: new Date().toISOString(), pending: true },
        ],
      }))
      return { tempId }
    },
    onSuccess: (data, _message, context) => {
      queryClient.setQueryData<ChatMessagesData>(queryKey, (old) => ({
        sessionId: data.session_id,
        messages: [
          ...(old?.messages ?? []).map((m) => (m.id === context?.tempId ? { ...m, pending: false } : m)),
          {
            id: data.message_id,
            role: 'assistant',
            content: data.content,
            cited_pages: data.cited_pages,
            source: data.source,
            created_at: data.created_at,
          },
        ],
      }))
    },
    onError: (_err, _message, context) => {
      queryClient.setQueryData<ChatMessagesData>(queryKey, (old) => ({
        sessionId: old?.sessionId ?? null,
        messages: (old?.messages ?? []).map((m) =>
          m.id === context?.tempId ? { ...m, pending: false, failed: true } : m
        ),
      }))
    },
  })
}
