'use client'

import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@/hooks/useChatMessages'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ChatEmptyState } from './ChatEmptyState'

export function ChatMessageList({
  messages,
  onRetry,
}: {
  messages: ChatMessage[]
  onRetry: (message: ChatMessage) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  if (messages.length === 0) return <ChatEmptyState />

  return (
    <div className="flex flex-1 flex-col gap-sm overflow-y-auto">
      {messages.map((message) => (
        <ChatMessageBubble key={message.id} message={message} onRetry={() => onRetry(message)} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
