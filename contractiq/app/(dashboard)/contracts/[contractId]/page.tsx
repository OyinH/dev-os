import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ContractWorkspace } from '@/components/results/ContractWorkspace'

export default async function ContractPage({ params }: { params: { contractId: string } }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', params.contractId)
    .single<{ id: string }>()

  if (fetchError || !contract) notFound()

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-md px-md py-3xl">
      <Link href="/dashboard" className="text-body text-brand hover:underline">
        ← Back to dashboard
      </Link>
      <ContractWorkspace contractId={contract.id} />
    </div>
  )
}
