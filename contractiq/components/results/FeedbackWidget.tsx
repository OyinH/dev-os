'use client'

import { useState } from 'react'
import { useFeedback, useSubmitFeedback } from '@/hooks/useFeedback'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'

const MAX_COMMENT_LENGTH = 1000

export function FeedbackWidget({ contractId }: { contractId: string }) {
  const { data: feedback } = useFeedback(contractId)
  const submitFeedback = useSubmitFeedback()
  const [pendingRating, setPendingRating] = useState<'up' | 'down' | null>(null)
  const [comment, setComment] = useState('')

  const rating = feedback?.rating ?? null
  const showCommentBox = pendingRating !== null

  function selectRating(next: 'up' | 'down') {
    setPendingRating(next)
    setComment(feedback?.comment ?? '')
  }

  function submit() {
    if (!pendingRating) return
    submitFeedback.mutate({ contract_id: contractId, rating: pendingRating, comment: comment.trim() || undefined })
    setPendingRating(null)
  }

  return (
    <div className="flex flex-col gap-sm rounded-card border border-border bg-surface-elevated p-md">
      <div className="flex items-center gap-sm">
        <span className="text-body text-text-secondary">Was this helpful?</span>
        <button
          type="button"
          aria-label="Thumbs up"
          onClick={() => selectRating('up')}
          className={`rounded-input border px-sm py-xs text-body-lg ${
            rating === 'up' ? 'border-success bg-success/10 text-success' : 'border-border-strong text-text-muted'
          }`}
        >
          👍
        </button>
        <button
          type="button"
          aria-label="Thumbs down"
          onClick={() => selectRating('down')}
          className={`rounded-input border px-sm py-xs text-body-lg ${
            rating === 'down' ? 'border-error bg-error/10 text-error' : 'border-border-strong text-text-muted'
          }`}
        >
          👎
        </button>
      </div>

      {showCommentBox && (
        <div className="flex flex-col gap-xs">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
            placeholder="Optional comment…"
            rows={3}
          />
          <div className="flex justify-end gap-sm">
            <Button variant="ghost" onClick={() => setPendingRating(null)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitFeedback.isPending}>
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
