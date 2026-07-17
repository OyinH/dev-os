'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { createClient } from '@/lib/supabase/client'

export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setUnconfirmed(false)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.message ?? 'Something went wrong. Please try again.')
        if (data.error === 'EMAIL_NOT_CONFIRMED') setUnconfirmed(true)
        return
      }

      router.push(returnTo)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResendStatus('sending')
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email })
    setResendStatus('sent')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-md">
      {error && (
        <Alert variant="error">
          {error}
          {unconfirmed && (
            <>
              {' '}
              {resendStatus === 'sent' ? (
                <span>Verification email sent.</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendStatus === 'sending'}
                  className="underline"
                >
                  Resend verification email
                </button>
              )}
            </>
          )}
        </Alert>
      )}

      <div className="flex flex-col gap-xs">
        <label htmlFor="email" className="text-body text-text-secondary">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-xs">
        <label htmlFor="password" className="text-body text-text-secondary">
          Password
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <Button type="submit" loading={loading} className="mt-sm">
        Sign in
      </Button>

      <p className="text-body text-text-muted">
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" className="text-brand hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  )
}
