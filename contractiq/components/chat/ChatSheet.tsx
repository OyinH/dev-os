'use client'

import { useChatMessages, useSendChatMessage, type ChatMessage } from '@/hooks/useChatMessages'
import { ChatMessageList } from './ChatMessageList'
import { ChatComposer } from './ChatComposer'

export function ChatSheet({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const { data, isLoading } = useChatMessages(contractId, true)
  const sendMessage = useSendChatMessage(contractId)

  function retry(message: ChatMessage) {
    sendMessage.mutate(message.content)
  }

  return (
    <div
      role="dialog"
      aria-label="Contract chat"
      className="fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-md flex-col gap-md border-l border-border bg-surface-bg p-md shadow-md"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-text-primary">Ask about this contract</h3>
        <button type="button" onClick={onClose} aria-label="Close chat" className="text-body-lg text-text-muted hover:text-text-primary">
          ✕
        </button>
      </div>

      {isLoading ? (
        <p className="text-body text-text-muted">Loading conversation…</p>
      ) : (
        <ChatMessageList messages={data?.messages ?? []} onRetry={retry} />
      )}

      <ChatComposer
        contractId={contractId}
        disabled={sendMessage.isPending}
        onSend={(message) => sendMessage.mutate(message)}
      />
    </div>
  )
}
