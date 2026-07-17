# Spec 07 — Dashboard & History

**Maps to:** US-008, FR-10
**Route:** `app/(app)/dashboard/page.tsx`
**Depends on:** `contracts` table (read-only)

---

## 1. User Flow

1. User lands on `/dashboard` after sign-in
2. Summary card shows total contracts processed, breakdown by type (NDA/MSA), and the last 5 contracts with status/date
3. A full sortable list (by date, name, type) is available below/alongside the summary
4. Clicking any row opens `/contracts/[contractId]` (Spec 05)
5. Zero contracts → empty state ("No contracts reviewed yet — upload your first contract to begin")

## 2. Data Fetching Contract

No dedicated Edge Function — direct RLS-scoped reads.

```ts
// hooks/useContracts.ts
export function useContracts() {
  return useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, title, contract_type, status, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// Summary counts — client-side aggregation over the same query result,
// acceptable at MVP scale (≤200 contracts per PRD Assumption 4)
export function summarizeContracts(contracts: { contract_type: string }[]) {
  return {
    total: contracts.length,
    byType: contracts.reduce<Record<string, number>>((acc, c) => {
      acc[c.contract_type] = (acc[c.contract_type] ?? 0) + 1
      return acc
    }, {}),
  }
}
```

`['contracts']` is invalidated by the upload (Spec 02), process (Spec 03), and delete (Spec 10) mutations — the dashboard never needs its own polling.

## 3. Component Spec

| Component | Responsibility |
|---|---|
| `SummaryCards` | Total count + by-type breakdown |
| `ContractListTable` | Sortable columns (name, type, date, status); local component state (not Zustand) for sort column/direction — ephemeral, page-scoped |
| Empty state block | Illustration/copy + "Upload your first contract" CTA, shown only when `contracts.length === 0` |

Status tag mapping: `processing` → Grey, `completed` → Green, `error` → Red — same `Semantic Status Badge` pattern as `ConfidenceBadge` (Spec 03).

## 4. Design

Table rows: `background: var(--bg-primary)`, `border-bottom: 1px solid var(--color-grey-100)`, hover `background: var(--color-grey-50)` (per `docs/design.md` interaction states table).

## 5. Edge Cases

| Case | Behavior |
|---|---|
| Zero contracts | Empty state, not an empty table with headers |
| A contract in `error` status | Appears with a Red status tag; clicking it opens the results page in a retry-affordance state (Spec 03) rather than a broken results view |
| Very long contract titles | Truncated with ellipsis + full title on hover/tooltip |
| Sorting a large list (~200-contract ceiling) | Client-side sort is acceptable at this scale; no pagination required at MVP |
| Contract deleted elsewhere (Spec 10) | Removed from this list via `['contracts']` invalidation — no stale row lingers |

## 6. Acceptance Criteria (US-008)

- [ ] Dashboard shows contract name, type, date, and status for every contract
- [ ] Row click opens the corresponding results page
- [ ] Summary card shows accurate total and by-type counts
- [ ] Zero-contract state shows the empty-state copy and upload CTA, not an empty table
