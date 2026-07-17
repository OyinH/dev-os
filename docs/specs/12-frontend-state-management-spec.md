# Spec 12 — Frontend State Management

**Used by:** all feature specs
**Layers:** TanStack Query (server state), Zustand (client UI state)

---

## 1. Query Client Setup — `lib/query-client.tsx`

```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Mounted once in `app/layout.tsx`, wrapping `{children}`.

## 2. Query Key Registry

Every query key used across the app, in one place, to prevent drift between features:

| Key | Owns | Invalidated by |
|---|---|---|
| `['contracts']` | Dashboard list (Spec 07) | upload (Spec 02), process (Spec 03), delete (Spec 10) |
| `['contract', contractId]` | Single contract detail (Spec 05) | upload (seed), process (Spec 03) |
| `['key-terms', contractId]` | Standard + custom terms (Spec 05) | process (Spec 03), edit (Spec 08, optimistic) |
| `['signed-url', contractId]` | PDF signed URL (Spec 05) | 403 refetch handler, `staleTime` ~55min |
| `['chat-messages', sessionId]` | Chat history (Spec 06) | send message (optimistic append) |
| `['feedback', contractId]` | Feedback state (Spec 09) | `setQueryData` directly on submit, no invalidation needed |

## 3. Zustand Stores

### `stores/upload-wizard-store.ts`

```ts
import { create } from 'zustand'

type WizardStep = 'select-type' | 'upload' | 'preview' | 'processing'

interface UploadWizardState {
  step: WizardStep
  contractType: 'NDA' | 'MSA' | null
  selectedFile: File | null
  customTerms: string[]
  setStep: (step: WizardStep) => void
  setContractType: (type: 'NDA' | 'MSA') => void
  setSelectedFile: (file: File | null) => void
  addCustomTerm: (term: string) => void
  removeCustomTerm: (term: string) => void
  reset: () => void
}

const initialState = {
  step: 'select-type' as WizardStep,
  contractType: null,
  selectedFile: null,
  customTerms: [] as string[],
}

export const useUploadWizardStore = create<UploadWizardState>((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setContractType: (contractType) => set({ contractType }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  addCustomTerm: (term) =>
    set((state) =>
      state.customTerms.length >= 5 ? state : { customTerms: [...state.customTerms, term] }
    ),
  removeCustomTerm: (term) =>
    set((state) => ({ customTerms: state.customTerms.filter((t) => t !== term) })),
  reset: () => set(initialState),
}))
```

### `stores/panel-ui-store.ts`

```ts
import { create } from 'zustand'

interface PanelUiState {
  targetPage: number | null
  viewerZoom: number
  chatOpen: boolean
  setTargetPage: (page: number) => void
  setViewerZoom: (zoom: number) => void
  setChatOpen: (open: boolean) => void
}

export const usePanelUiStore = create<PanelUiState>((set) => ({
  targetPage: null,
  viewerZoom: 1,
  chatOpen: false,
  setTargetPage: (targetPage) => set({ targetPage }),
  setViewerZoom: (viewerZoom) => set({ viewerZoom }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
}))
```

### `stores/chat-draft-store.ts`

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface ChatDraftState {
  drafts: Record<string, string>
  setDraft: (contractId: string, text: string) => void
  clearDraft: (contractId: string) => void
}

export const useChatDraftStore = create<ChatDraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (contractId, text) =>
        set((state) => ({ drafts: { ...state.drafts, [contractId]: text } })),
      clearDraft: (contractId) =>
        set((state) => {
          const { [contractId]: _removed, ...rest } = state.drafts
          return { drafts: rest }
        }),
    }),
    {
      name: 'contractiq-chat-drafts',
      storage: createJSONStorage(() => sessionStorage), // survives in-tab navigation, not shared across tabs/devices
    }
  )
)
```

`panel-ui-store` and `upload-wizard-store` are intentionally **not** persisted — both are single-session, page-scoped UI state per `engineering-doc.md` §5. `chat-draft-store` persists to `sessionStorage` (not `localStorage`) so an unsent draft survives navigation within a tab but does not leak across devices/sessions.

## 4. Rule: what goes in Zustand vs. TanStack Query

| If the data... | Use |
|---|---|
| Comes from the database | TanStack Query |
| Is a mutation result that other components need to react to | TanStack Query cache (`setQueryData`/`invalidateQueries`) |
| Is pure UI state with no server representation (wizard step, zoom level, unsent draft) | Zustand |
| Is ephemeral and scoped to a single component (sort column on a table) | Local `useState`, not Zustand |

## 5. Acceptance Criteria

- [ ] No component reads database rows from Zustand — server state only ever lives in TanStack Query
- [ ] Every mutation's cache effect matches the table in §2 exactly (no undocumented invalidations)
- [ ] `chat-draft-store` survives a page navigation within the same tab but not a full page reload from a fresh session
