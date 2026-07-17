'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

export function SignUpForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  function validate(): string | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.message ?? 'Something went wrong. Please try again.')
        return
      }

      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return <Alert variant="success">Check your email to verify your account.</Alert>
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-md">
      {error && <Alert variant="error">{error}</Alert>}

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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <Button type="submit" loading={loading} className="mt-sm">
        Sign up
      </Button>

      <p className="text-body text-text-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
