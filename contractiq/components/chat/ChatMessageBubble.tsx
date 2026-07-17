import type { ChatMessage } from '@/hooks/useChatMessages'
import { PageCitationChip } from './PageCitationChip'
import { Badge } from '@/components/ui/Badge'

const SOURCE_LABELS = {
  contract: 'From contract',
  history: 'From conversation',
  both: 'From contract & conversation',
} as const

export function ChatMessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const isUser = message.role === 'user'
  const sourceLabel = !isUser && message.source ? SOURCE_LABELS[message.source] : null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[85%] flex-col gap-xs rounded-card px-md py-sm ${
          isUser ? 'bg-blue-light text-text-primary' : 'bg-surface-subtle text-text-primary'
        } ${message.pending ? 'opacity-60' : ''}`}
      >
        {sourceLabel && <Badge variant="neutral">{sourceLabel}</Badge>}
        <p className="whitespace-pre-wrap text-body">{message.content}</p>

        {message.cited_pages.length > 0 && (
          <div className="flex flex-wrap gap-xs">
            {message.cited_pages.map((page) => (
              <PageCitationChip key={page} page={page} />
            ))}
          </div>
        )}

        {message.failed && (
          <button type="button" onClick={onRetry} className="self-start text-small text-error hover:underline">
            Failed to send — Try again
          </button>
        )}
      </div>
    </div>
  )
}
