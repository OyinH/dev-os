# Spec 05 — Results Display (PDF Viewer + Key Terms Panel)

**Maps to:** US-003, US-004, US-006, FR-04, FR-06, FR-07, FR-11
**Route:** `app/(app)/contracts/[contractId]/page.tsx`
**Depends on:** `contracts`, `key_terms`, `custom_key_terms` (read-only), `touch_contract_access` RPC

---

## 1. User Flow

1. Results page loads: two-panel layout (`ResizablePanelGroup`) — contract content left, key terms right
2. `ContractContentViewer` requests a signed URL for `file_path`; if it resolves, renders `PdfViewer` (PDF.js); otherwise falls back to `TextViewerFallback` (parses `[PAGE N]` markers from `contract_text`)
3. User scrolls/zooms the PDF; clicking a key term's page reference scrolls the viewer to that page and highlights the nearest matching span via `source_sentence` substring search (page-border fallback if no exact match)
4. User expands "Why?" on any term to see the verbatim `source_sentence`
5. `DisclaimerBanner` ("Not legal advice") is always visible on this page

## 2. Data Fetching Contract

No dedicated Edge Function — direct RLS-scoped `supabase-js` reads.

```ts
// hooks/useContract.ts
export function useContract(contractId: string) {
  return useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const { data, error } = await supabase.from('contracts').select('*').eq('id', contractId).single()
      if (error) throw error
      return data
    },
  })
}

// hooks/useKeyTerms.ts
export function useKeyTerms(contractId: string) {
  return useQuery({
    queryKey: ['key-terms', contractId],
    queryFn: async () => {
      const [standard, custom] = await Promise.all([
        supabase.from('key_terms').select('*').eq('contract_id', contractId).order('display_order'),
        supabase.from('custom_key_terms').select('*').eq('contract_id', contractId).order('display_order'),
      ])
      if (standard.error) throw standard.error
      if (custom.error) throw custom.error
      return { standard: standard.data, custom: custom.data }
    },
  })
}

// hooks/useSignedUrl.ts
export function useSignedUrl(filePath: string | null, contractId: string) {
  return useQuery({
    queryKey: ['signed-url', contractId],
    queryFn: async () => {
      if (!filePath) return null
      const { data, error } = await supabase.storage.from('contracts').createSignedUrl(filePath, 3600)
      if (error) return null // triggers TextViewerFallback, not an error state
      return data.signedUrl
    },
    enabled: !!filePath,
    staleTime: 55 * 60 * 1000, // just under the 1hr expiry
  })
}
```

On mount, fire-and-forget the retention RPC:

```ts
useEffect(() => {
  supabase.rpc('touch_contract_access', { p_contract_id: contractId })
}, [contractId])
```

## 3. Page-jump and highlight contract

`Zustand panelUiStore`:

```ts
interface PanelUiState {
  targetPage: number | null
  viewerZoom: number
  setTargetPage: (page: number) => void
  setViewerZoom: (zoom: number) => void
}
```

`PageRefButton` calls `setTargetPage(term.page_number)`. Both `PdfViewer` and `TextViewerFallback` subscribe to `targetPage` and:
1. Scroll the corresponding page into view
2. Attempt a substring search for the clicked term's `source_sentence` within that page's text layer
3. On match: highlight the exact span. On no match (whitespace/ligature drift): apply a page-level border highlight only — never a blank/crash state

## 4. Component Spec

Full tree (from `engineering-doc.md` §5):

```
ResultsPage (Server Component — SSR fetch + hydrate)
 └─ ContractWorkspace (Client)
     ├─ DisclaimerBanner              "Not legal advice"
     ├─ ResizablePanelGroup           default ~55/45 split
     │   ├─ ContractContentViewer
     │   │   ├─ PdfViewer               (PDF.js, when signed URL resolves)
     │   │   │   ├─ PdfToolbar          zoom controls
     │   │   │   └─ PdfPageCanvas × N   lazy-loaded per page
     │   │   └─ TextViewerFallback      parses [PAGE N] markers
     │   │       └─ TextPage × N
     │   └─ KeyTermsPanel
     │       ├─ KeyTermList
     │       │   └─ KeyTermCard
     │       │       ├─ ConfidenceBadge
     │       │       ├─ TermValueEditable    (Spec 08)
     │       │       ├─ PageRefButton        → setTargetPage
     │       │       ├─ WhySection           [Collapsible] source_sentence
     │       │       └─ LowConfidenceWarning
     │       ├─ CustomTermBadge (is_manual rows)
     │       └─ FeedbackWidget          (Spec 09)
     └─ ChatPanel                      (Spec 06)
```

## 5. Design

Two-panel `Resizable` split, default ~55/45. Page padding 112px/96px, section gap 40px, sub-section gap 24px (`docs/design.md` spacing tokens). Term cards: `radius: 8px`, `background: var(--bg-primary)`, `border: 1px solid var(--color-grey-100)`, `16px` internal padding. Mobile (<`md` breakpoint): panels collapse into `Tabs` ("Document" / "Key Terms") instead of a fixed split.

## 6. Edge Cases

| Case | Behavior |
|---|---|
| Signed URL fails to resolve (Storage unavailable or `file_path` null) | `TextViewerFallback` renders automatically — user never sees a broken/blank viewer |
| Signed URL expires mid-session (>1hr review) | `PdfViewer` catches a `403` on the asset load and triggers `queryClient.invalidateQueries(['signed-url', contractId])` to fetch a fresh URL transparently |
| `source_sentence` has no exact text-layer match (whitespace/ligature drift) | Falls back to page-level border highlight only — never a crash or blank highlight state |
| Multiple terms reference the same page | All render correctly in the terms panel; only page-level (not span-level) sync is guaranteed when several terms share a page — documented MVP scope limit |
| Very large PDF (near 20-page/10MB ceiling) | PDF.js pages load lazily to avoid render-blocking the whole document |
| Term references a `page_number` beyond `contracts.page_count` | `PageRefButton` disabled/no-ops rather than attempting an out-of-range scroll |
| Reverse sync (scrolling PDF auto-highlights a term) | **Explicitly not implemented** — documented MVP scope exclusion, not a bug |

## 7. Acceptance Criteria (US-003, US-004, US-006)

- [ ] Every term displays a page number; clicking it scrolls the viewer to that page
- [ ] Confidence score 0–100% shown per term; <50% shows the warning icon + tooltip
- [ ] PDF viewer renders all pages; user can scroll and zoom in/out
- [ ] Highlighted term references are clickable
- [ ] When Storage is unavailable, the text viewer fallback renders instead of a broken viewer
- [ ] "Not legal advice" disclaimer is visible on every results page load
