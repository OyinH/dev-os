'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

export function SignOutButton({ className = '' }: { className?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    router.push('/')
    router.refresh()
  }

  return (
    <Button variant="ghost" loading={loading} onClick={handleSignOut} className={className}>
      Sign out
    </Button>
  )
}
