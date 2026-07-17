export function LowConfidenceWarning() {
  return (
    <span
      title="Low confidence — this extraction may be inaccurate. Please verify against the source document."
      className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-error/10 text-small text-error"
      aria-label="Low confidence warning"
    >
      !
    </span>
  )
}
