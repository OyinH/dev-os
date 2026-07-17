import { create } from 'zustand'

interface PanelUiState {
  targetPage: number | null
  targetSentence: string | null
  setTargetPage: (page: number, sentence?: string | null) => void
}

export const usePanelUiStore = create<PanelUiState>((set) => ({
  targetPage: null,
  targetSentence: null,
  setTargetPage: (page, sentence = null) => set({ targetPage: page, targetSentence: sentence }),
}))
