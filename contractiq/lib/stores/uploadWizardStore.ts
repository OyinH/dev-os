import { create } from 'zustand'
import { MAX_CUSTOM_TERMS } from '@/lib/constants/standard-terms'

type ContractType = 'NDA' | 'MSA'
type WizardStep = 'select-type' | 'upload' | 'preview' | 'processing'

interface UploadWizardState {
  step: WizardStep
  contractType: ContractType | null
  selectedFile: File | null
  customTerms: string[]
  setStep: (step: WizardStep) => void
  setContractType: (contractType: ContractType) => void
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
      state.customTerms.length >= MAX_CUSTOM_TERMS ? state : { customTerms: [...state.customTerms, term] }
    ),
  removeCustomTerm: (term) => set((state) => ({ customTerms: state.customTerms.filter((t) => t !== term) })),
  reset: () => set(initialState),
}))
