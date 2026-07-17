'use client'

import { Button } from '@/components/ui/Button'

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  loading,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-md rounded-card bg-surface-elevated p-lg shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-h4 text-text-primary">{title}</h3>
        <p className="text-body text-text-secondary">{description}</p>
        <div className="flex justify-end gap-sm">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
