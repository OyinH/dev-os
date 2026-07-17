export function ChatEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-xs text-center">
      <p className="text-body-lg text-text-primary">Ask a question about this contract</p>
      <p className="text-body text-text-muted">Answers are grounded in the document, with page citations.</p>
    </div>
  )
}
