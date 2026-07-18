'use client'

import Link from 'next/link'
import { useContracts } from '@/hooks/useContracts'
import { SummaryCards } from './SummaryCards'
import { ContractListTable } from './ContractListTable'
import { Button } from '@/components/ui/Button'

export function DashboardContent({ email }: { email: string }) {
  const { data: contracts, isLoading, isError } = useContracts()

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg px-md py-3xl">
      <div>
        <h1 className="text-h2 text-text-primary">Dashboard</h1>
        <p className="text-body text-text-secondary">Signed in as {email}</p>
      </div>

      {isLoading && <p className="text-body text-text-muted">Loading contracts…</p>}
      {isError && <p className="text-body text-error">Could not load contracts. Please refresh.</p>}

      {contracts && contracts.length === 0 && (
        <div className="flex flex-col items-center gap-sm rounded-card border border-border bg-surface-elevated p-3xl text-center">
          <p className="text-body-lg text-text-primary">No contracts reviewed yet</p>
          <p className="text-body text-text-secondary">Upload your first contract to begin.</p>
          <Link href="/upload">
            <Button className="mt-sm">Upload your first contract</Button>
          </Link>
        </div>
      )}

      {contracts && contracts.length > 0 && (
        <>
          <SummaryCards contracts={contracts} />
          <ContractListTable contracts={contracts} />
        </>
      )}
    </div>
  )
}
