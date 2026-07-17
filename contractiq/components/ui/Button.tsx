import { ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'bg-secondary text-white hover:bg-secondary-hover',
  ghost: 'bg-transparent text-text-primary border border-border-strong hover:bg-surface-subtle',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading = false, disabled, className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`h-11 rounded-input px-md text-body-lg font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
)
Button.displayName = 'Button'
