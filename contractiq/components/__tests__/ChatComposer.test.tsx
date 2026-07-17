import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatComposer } from '../chat/ChatComposer'
import { useChatDraftStore } from '@/lib/stores/chatDraftStore'

beforeEach(() => {
  useChatDraftStore.setState({ drafts: {} })
})

describe('ChatComposer', () => {
  it('disables submit when the input is empty', () => {
    render(<ChatComposer contractId="c1" disabled={false} onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('disables submit when the input is whitespace-only', async () => {
    const user = userEvent.setup()
    render(<ChatComposer contractId="c1" disabled={false} onSend={vi.fn()} />)
    await user.type(screen.getByLabelText('Message'), '   ')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('enables submit once non-whitespace text is entered', async () => {
    const user = userEvent.setup()
    render(<ChatComposer contractId="c1" disabled={false} onSend={vi.fn()} />)
    await user.type(screen.getByLabelText('Message'), 'Does this auto-renew?')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('disables submit while a request is in flight, even with text present', async () => {
    const user = userEvent.setup()
    render(<ChatComposer contractId="c1" disabled={true} onSend={vi.fn()} />)
    await user.type(screen.getByLabelText('Message'), 'Does this auto-renew?')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('re-enables submit once the in-flight request settles', () => {
    useChatDraftStore.setState({ drafts: { c1: 'Does this auto-renew?' } })
    const { rerender } = render(<ChatComposer contractId="c1" disabled={true} onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    rerender(<ChatComposer contractId="c1" disabled={false} onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })
})
