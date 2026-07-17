'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { ContractListItem } from '@/hooks/useContracts'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useDeleteContract } from '@/hooks/useDeleteContract'

type SortColumn = 'title' | 'contract_type' | 'created_at'
type SortDirection = 'asc' | 'desc'

const STATUS_BADGE: Record<ContractListItem['status'], { variant: 'warning' | 'success' | 'error'; label: string }> = {
  processing: { variant: 'warning', label: 'Processing' },
  completed: { variant: 'success', label: 'Completed' },
  error: { variant: 'error', label: 'Error' },
}

export function ContractListTable({ contracts }: { contracts: ContractListItem[] }) {
  const router = useRouter()
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const deleteContract = useDeleteContract()

  const sorted = useMemo(() => {
    const copy = [...contracts]
    copy.sort((a, b) => {
      const cmp = a[sortColumn].localeCompare(b[sortColumn])
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return copy
  }, [contracts, sortColumn, sortDirection])

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const columns: { key: SortColumn; label: string }[] = [
    { key: 'title', label: 'Name' },
    { key: 'contract_type', label: 'Type' },
    { key: 'created_at', label: 'Date' },
  ]

  return (
    <>
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              onClick={() => toggleSort(col.key)}
              className="cursor-pointer border-b border-border py-sm text-left text-body text-text-secondary"
            >
              {col.label}
              {sortColumn === col.key && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
            </th>
          ))}
          <th className="border-b border-border py-sm text-left text-body text-text-secondary">Status</th>
          <th className="border-b border-border py-sm text-left text-body text-text-secondary" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((contract) => (
          <tr
            key={contract.id}
            onClick={() => router.push(`/contracts/${contract.id}`)}
            className="cursor-pointer border-b border-border transition-colors duration-150 ease-out hover:bg-surface-subtle"
          >
            <td className="max-w-xs truncate py-sm text-body-lg text-text-primary" title={contract.title}>
              {contract.title}
            </td>
            <td className="py-sm text-body text-text-secondary">{contract.contract_type}</td>
            <td className="py-sm text-body text-text-secondary">
              {new Date(contract.created_at).toLocaleDateString()}
            </td>
            <td className="py-sm">
              <Badge variant={STATUS_BADGE[contract.status].variant}>{STATUS_BADGE[contract.status].label}</Badge>
            </td>
            <td className="py-sm text-right">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setPendingDeleteId(contract.id)
                }}
                className="text-small text-text-muted hover:text-error"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>

    {pendingDeleteId && (
      <ConfirmDialog
        title="Delete contract"
        description="This cannot be undone."
        confirmLabel="Delete"
        loading={deleteContract.isPending}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          deleteContract.mutate(pendingDeleteId, { onSettled: () => setPendingDeleteId(null) })
        }}
      />
    )}
    </>
  )
}
