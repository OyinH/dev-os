type AlertVariant = 'error' | 'success' | 'info'

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'bg-error/10 border-error/30 text-error',
  success: 'bg-success/10 border-success/30 text-success',
  info: 'bg-info/10 border-info/30 text-info',
}

export function Alert({ variant = 'error', children }: { variant?: AlertVariant; children: React.ReactNode }) {
  return (
    <div role="alert" className={`rounded-input border px-md py-sm text-body ${VARIANT_CLASSES[variant]}`}>
      {children}
    </div>
  )
}
