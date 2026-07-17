import { InputHTMLAttributes, forwardRef } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`h-11 w-full rounded-input border border-border-strong bg-surface-bg px-md text-body-lg text-text-primary placeholder:text-text-muted transition-colors duration-150 ease-out focus:border-brand focus:outline-none ${className}`}
      {...props}
    />
  )
)
Input.displayName = 'Input'
