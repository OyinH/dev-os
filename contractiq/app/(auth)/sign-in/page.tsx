import { Suspense } from 'react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SignInForm } from '@/components/auth/SignInForm'

export default function SignInPage() {
  return (
    <AuthLayout title="Sign in">
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </AuthLayout>
  )
}
