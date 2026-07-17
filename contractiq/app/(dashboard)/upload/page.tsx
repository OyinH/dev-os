import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UploadWizard } from '@/components/upload/UploadWizard'

export default async function UploadPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-subtle px-md">
      <div className="w-full max-w-[560px] rounded-card border border-border bg-surface-elevated p-xl">
        <h1 className="mb-lg text-h2 text-text-primary">Upload a contract</h1>
        <UploadWizard />
      </div>
    </main>
  )
}
