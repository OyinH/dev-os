import { TextareaHTMLAttributes, forwardRef } from 'react'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-input border border-border-strong bg-surface-bg px-md py-sm text-body-lg text-text-primary placeholder:text-text-muted transition-colors duration-150 ease-out focus:border-brand focus:outline-none ${className}`}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'
