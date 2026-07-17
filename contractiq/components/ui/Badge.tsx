type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral'

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  neutral: 'bg-surface-card text-text-muted',
}

export function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-badge px-sm py-[2px] text-small font-medium ${VARIANT_CLASSES[variant]}`}>
      {children}
    </span>
  )
}
