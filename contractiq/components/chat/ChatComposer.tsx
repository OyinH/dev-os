'use client'

import { useChatDraftStore } from '@/lib/stores/chatDraftStore'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'

export function ChatComposer({
  contractId,
  disabled,
  onSend,
}: {
  contractId: string
  disabled: boolean
  onSend: (message: string) => void
}) {
  const draft = useChatDraftStore((s) => s.drafts[contractId] ?? '')
  const setDraft = useChatDraftStore((s) => s.setDraft)
  const clearDraft = useChatDraftStore((s) => s.clearDraft)

  const canSend = draft.trim().length > 0 && !disabled

  function send() {
    if (!canSend) return
    onSend(draft.trim())
    clearDraft(contractId)
  }

  return (
    <div className="flex gap-sm">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(contractId, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        placeholder="Ask a question about this contract…"
        aria-label="Message"
        rows={2}
        disabled={disabled}
      />
      <Button type="button" onClick={send} disabled={!canSend} className="self-end">
        Send
      </Button>
    </div>
  )
}
