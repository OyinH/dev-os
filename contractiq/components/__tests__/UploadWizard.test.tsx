import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UploadWizard } from '../upload/UploadWizard'
import { useUploadWizardStore } from '@/lib/stores/uploadWizardStore'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ functions: { invoke: vi.fn() } }),
}))

function renderWizard() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <UploadWizard />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useUploadWizardStore.getState().reset()
})

describe('UploadWizard step transitions', () => {
  it('cannot advance past select-type without a contract type chosen', () => {
    renderWizard()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('advances to the upload step once a contract type is chosen and Continue is clicked', async () => {
    const user = userEvent.setup()
    renderWizard()
    await user.click(screen.getByRole('radio', { name: /NDA/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText(/Drag and drop a PDF/i)).toBeInTheDocument()
  })

  it('cannot reach the preview step without a file selected', async () => {
    const user = userEvent.setup()
    renderWizard()
    await user.click(screen.getByRole('radio', { name: /NDA/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('button', { name: 'Upload contract' })).toBeDisabled()
  })
})
