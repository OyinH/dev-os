'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useContract } from '@/hooks/useContract'
import { useKeyTerms } from '@/hooks/useKeyTerms'
import { useDeleteContract } from '@/hooks/useDeleteContract'
import { createClient } from '@/lib/supabase/client'
import { DisclaimerBanner } from './DisclaimerBanner'
import { TextViewerFallback } from './TextViewerFallback'
import { KeyTermsPanel } from './KeyTermsPanel'
import { FeedbackWidget } from './FeedbackWidget'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { ChatFAB } from '@/components/chat/ChatFAB'
import { ChatSheet } from '@/components/chat/ChatSheet'

export function ContractWorkspace({ contractId }: { contractId: string }) {
  const router = useRouter()
  const { data: contract, isLoading: contractLoading, isError: contractError } = useContract(contractId)
  const { data: keyTerms, isLoading: termsLoading } = useKeyTerms(contractId)
  const deleteContract = useDeleteContract()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // @supabase/ssr@0.5.x's createBrowserClient typing predates a
    // @supabase/supabase-js internals restructure (installed: 2.110.x), which
    // breaks .rpc()'s generic Args inference at the type level only — the
    // runtime call is unaffected. Cast narrowly rather than touching
    // dependency versions that every other verified query already relies on.
    ;(supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'touch_contract_access',
      { p_contract_id: contractId }
    )
  }, [contractId])

  if (contractLoading) return <p className="text-body text-text-muted">Loading contract…</p>
  if (contractError || !contract) return <p className="text-body text-error">Could not load this contract.</p>

  const mismatch =
    contract.detected_contract_type !== null && contract.detected_contract_type !== contract.contract_type

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <DisclaimerBanner />
        <Button variant="ghost" onClick={() => setConfirmingDelete(true)} className="shrink-0">
          Delete
        </Button>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete contract"
          description="This cannot be undone."
          confirmLabel="Delete"
          loading={deleteContract.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            deleteContract.mutate(contractId, {
              onSuccess: () => router.push('/dashboard'),
              onSettled: () => setConfirmingDelete(false),
            })
          }}
        />
      )}

      {mismatch && (
        <div className="rounded-badge border border-warning/30 bg-warning/10 px-md py-sm text-body text-text-secondary">
          This looks like it might be a <strong>{contract.detected_contract_type}</strong>, not the{' '}
          <strong>{contract.contract_type}</strong> you selected. Results are shown below regardless.
        </div>
      )}

      {contract.status === 'processing' && (
        <p className="text-body text-text-muted">This contract is still processing — check back shortly.</p>
      )}
      {contract.status === 'error' && (
        <p className="text-body text-error">
          {contract.error_message ?? 'Processing failed for this contract.'}
        </p>
      )}

      {contract.status === 'completed' && (
        <div className="flex gap-lg">
          <div className="flex-[55] overflow-y-auto">
            <TextViewerFallback contractText={contract.contract_text} />
          </div>
          <div className="flex-[45] overflow-y-auto">
            {termsLoading ? (
              <p className="text-body text-text-muted">Loading key terms…</p>
            ) : (
              <KeyTermsPanel
                contractId={contractId}
                standard={keyTerms?.standard ?? []}
                custom={keyTerms?.custom ?? []}
                maxPage={contract.page_count}
              />
            )}
            <div className="mt-md">
              <FeedbackWidget contractId={contractId} />
            </div>
          </div>
        </div>
      )}

      {contract.status === 'completed' && !chatOpen && <ChatFAB onClick={() => setChatOpen(true)} />}
      {contract.status === 'completed' && chatOpen && (
        <ChatSheet contractId={contractId} onClose={() => setChatOpen(false)} />
      )}
    </div>
  )
}
