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
      setDraft: (contractId, text) => set((state) => ({ drafts: { ...state.drafts, [contractId]: text } })),
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
