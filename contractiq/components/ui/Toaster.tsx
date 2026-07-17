'use client'

import { useToastStore } from '@/lib/stores/toastStore'

const VARIANT_CLASSES = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-error/30 bg-error/10 text-error',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-lg right-lg z-50 flex flex-col gap-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className={`cursor-pointer rounded-input border px-md py-sm text-body shadow-md ${VARIANT_CLASSES[t.variant]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
