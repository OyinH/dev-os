# Spec 06 — Contract Chat (Q&A)

**Maps to:** US-007, US-012, FR-08, FR-09
**Edge Function:** `chat-message`
**Depends on:** `chat_sessions`, `chat_messages` tables

---

## 1. User Flow

1. User opens `ChatSheet` via the floating `ChatFAB` (visible only once `contracts.status === 'completed'`)
2. If reopening an existing contract, prior `chat_sessions`/`chat_messages` load automatically
3. User types a question, sends — message optimistically appended, right-aligned
4. `chat-message` creates a session if none exists, fetches full `contract_text` + full message history (≤200, ascending), classifies the query (`contract`/`history`/`both`) via keyword heuristic, calls GPT-4o at `temperature=0.4` with a document-only system prompt
5. Response appears left-aligned within 15s P95, prefixed "Based on the document…", with a mandatory `[Page X]` citation rendered as a clickable chip
6. Clicking the citation sets `targetPage` (Spec 05 §3), scrolling the content viewer

## 2. Request / Response Contract

**Request:**

```json
{
  "contract_id": "uuid",
  "session_id": "uuid | null",
  "message": "Does this contract auto-renew?"
}
```

**Success response `200`:**

```json
{
  "message_id": "uuid",
  "role": "assistant",
  "content": "Based on the document, this Agreement automatically renews for successive 1-year terms unless either party provides 60 days' written notice [Page 3].",
  "cited_pages": [3],
  "created_at": "2026-07-15T10:00:00Z"
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `422` | Empty/whitespace-only `message` |
| `502` | OpenAI failure after 3 retries — does **not** affect `contracts.status` |

## 3. Query classification heuristic (no model call)

```ts
// supabase/functions/_shared/classify-query.ts
type QueryClassification = 'contract' | 'history' | 'both'

const HISTORY_KEYWORDS = [
  'earlier', 'you said', 'before', 'previously', 'last time',
  'what did you say', 'again', 'that answer', 'above',
]

export function classifyQuery(message: string): QueryClassification {
  const lower = message.toLowerCase()
  const hasHistorySignal = HISTORY_KEYWORDS.some((kw) => lower.includes(kw))
  const hasContractSignal = /clause|term|agreement|contract|page|section|provision/.test(lower)

  if (hasHistorySignal && hasContractSignal) return 'both'
  if (hasHistorySignal) return 'history'
  return 'contract'
}
```

The classification does not gate what's sent to the model (full contract text + full history are always passed) — it only adjusts system-prompt emphasis (see chat prompt below).

## 4. Chat system prompt — `supabase/functions/_shared/prompts/chat.ts`

```ts
import type { Database } from '../../../../types/database.types.ts'

type ChatMessage = Pick<Database['public']['Tables']['chat_messages']['Row'], 'role' | 'content'>

export function buildChatSystemPrompt(
  contractText: string,
  classification: 'contract' | 'history' | 'both'
): string {
  const emphasisLine =
    classification === 'history'
      ? 'The user is likely referring to something said earlier in this conversation — check the conversation history carefully before answering.'
      : classification === 'both'
        ? 'The user may be referring to both the document and something said earlier in this conversation — check both.'
        : 'Answer primarily from the document text.'

  return `You are a contract Q&A assistant. Answer ONLY from the document text provided below and the conversation history. If the answer is not in the document, say so plainly — do not guess or use outside knowledge.

${emphasisLine}

Rules:
- Every answer must include at least one page citation in the exact format [Page X], where X is the 1-indexed page number from the document's [PAGE N] markers.
- Prefix every answer with "Based on the document, ".
- If the document does not contain the answer, respond exactly: "Based on the document, I cannot find this in the document." (no page citation needed for this specific response)
- Never provide legal advice or opinions on whether a clause is favorable — describe what the document says, not what the user should do.

--- DOCUMENT ---
${contractText}
--- END DOCUMENT ---`
}

export function toOpenAIMessages(history: ChatMessage[]) {
  return history.map((m) => ({ role: m.role, content: m.content }))
}
```

## 5. Implementation — `supabase/functions/chat-message/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createUserClient } from '../_shared/supabase-client.ts'
import { callOpenAIWithRetry } from '../_shared/openai.ts'
import { classifyQuery } from '../_shared/classify-query.ts'
import { buildChatSystemPrompt, toOpenAIMessages } from '../_shared/prompts/chat.ts'

const MAX_HISTORY_MESSAGES = 200
const PAGE_CITATION_RE = /\[Page\s+(\d+)\]/gi

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)
    const supabase = createUserClient(authHeader)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const { contract_id, session_id, message } = await req.json()

    if (!message || !message.trim()) {
      return json({ error: 'empty_message' }, 422)
    }

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('contract_text')
      .eq('id', contract_id)
      .single()
    if (contractError || !contract) return json({ error: 'not_found' }, 404)

    let sessionId = session_id
    if (!sessionId) {
      const { data: existing } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('contract_id', contract_id)
        .maybeSingle()

      if (existing) {
        sessionId = existing.id
      } else {
        const { data: created, error: createError } = await supabase
          .from('chat_sessions')
          .insert({ contract_id, user_id: user.id })
          .select('id')
          .single()
        if (createError || !created) throw createError
        sessionId = created.id
      }
    }

    await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'user', content: message })

    const { data: historyRows } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)

    const classification = classifyQuery(message)
    const systemPrompt = buildChatSystemPrompt(contract.contract_text, classification)

    const responseText = await requestChatCompletionWithCitationRetry(
      systemPrompt,
      toOpenAIMessages(historyRows ?? [])
    )

    const citedPages = extractCitedPages(responseText)

    const { data: assistantMessage, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: responseText,
        cited_pages: citedPages,
        query_classification: classification,
      })
      .select()
      .single()

    if (insertError || !assistantMessage) throw insertError

    return json({
      message_id: assistantMessage.id,
      role: 'assistant',
      content: responseText,
      cited_pages: citedPages,
      created_at: assistantMessage.created_at,
    })
  } catch (err) {
    console.error('chat-message error', err)
    return json({ error: 'chat_failed', message: "We couldn't get a response. Please try again." }, 502)
  }
})

async function requestChatCompletionWithCitationRetry(
  systemPrompt: string,
  history: { role: string; content: string }[]
): Promise<string> {
  const messages = [{ role: 'system', content: systemPrompt }, ...history]

  const first = await callOpenAIWithRetry({
    model: 'gpt-4o',
    temperature: 0.4,
    max_tokens: 1000,
    messages,
  })

  const isNotFoundResponse = first.includes('I cannot find this in the document')
  if (isNotFoundResponse || PAGE_CITATION_RE.test(first)) {
    PAGE_CITATION_RE.lastIndex = 0
    return first
  }

  // Malformed response: missing the mandatory citation. One retry, same pattern as extraction's JSON retry.
  const retry = await callOpenAIWithRetry({
    model: 'gpt-4o',
    temperature: 0.4,
    max_tokens: 1000,
    messages: [
      ...messages,
      { role: 'assistant', content: first },
      { role: 'user', content: 'Your response must include a page citation in the exact format [Page X]. Please try again.' },
    ],
  })
  return retry
}

function extractCitedPages(text: string): number[] {
  const pages = new Set<number>()
  let match: RegExpExecArray | null
  PAGE_CITATION_RE.lastIndex = 0
  while ((match = PAGE_CITATION_RE.exec(text)) !== null) {
    pages.add(Number(match[1]))
  }
  return Array.from(pages).sort((a, b) => a - b)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

## 6. State Management

- TanStack Query `['chat-messages', sessionId]` — optimistic append of the user message on send, reconcile with the real row (and append the assistant reply) on resolve, rollback the optimistic user message on failure
- Zustand `chatDraftStore`: unsent draft text per `contract_id`, survives navigating away and back within the session

```ts
interface ChatDraftState {
  drafts: Record<string, string>
  setDraft: (contractId: string, text: string) => void
  clearDraft: (contractId: string) => void
}
```

## 7. Component Spec

| Component | Responsibility |
|---|---|
| `ChatFAB` | Floating action button, hidden until `contracts.status === 'completed'` |
| `ChatSheet` | shadcn `Sheet`, hosts the message list + composer |
| `ChatMessageList` | Virtualized list of `ChatMessageBubble` |
| `ChatMessageBubble` | Renders content + `PageCitationChip` per cited page |
| `PageCitationChip` | Clickable pill, calls `setTargetPage` |
| `ChatComposer` | `Textarea` + send `Button`; disabled while a request is in flight |
| `ChatEmptyState` | Shown when no messages exist yet for this contract |

## 8. Design

User messages: right-aligned, `background: var(--color-blue-50)`. Assistant messages: left-aligned, `background: var(--bg-surface)` (`--color-grey-25`), `color: var(--text-primary)`. Citation chip: `border: 1px solid var(--brand)`, `color: var(--brand)`, 4px radius, clickable pill.

## 9. Edge Cases

| Case | Behavior |
|---|---|
| Contract still `processing` | Chat entry point disabled/hidden until `status='completed'` — keeps the UX flow linear per PRD Flow 4, which starts from the Results Page |
| OpenAI timeout/failure | 3-retry backoff, then an inline error bubble with a "Try again" action scoped to that message — does not affect `contracts.status` |
| Model response omits `[Page X]` | Treated as malformed; one retry with an explicit citation reminder, same pattern as the extraction JSON retry |
| Question about a topic absent from the document | "Based on the document, I cannot find this in the document." is the correct, expected response — asserted by the automated hallucination regression test (Spec 14) |
| History approaches the 200-message cap | Oldest messages remain stored (never deleted); only the most recent 200 are sent as model context |
| Empty/whitespace-only message | Rejected client-side; `ChatComposer` submit stays disabled |
| Second message sent before first response resolves | Composer disabled while a request is in flight — prevents out-of-order optimistic messages |

## 10. Acceptance Criteria (US-007, US-012)

- [ ] Chat response latency ≤15s P95
- [ ] Every substantive response includes at least one `[Page X]` citation, rendered as a clickable chip
- [ ] Asking about an absent topic returns "I cannot find this in the document," never a fabricated answer
- [ ] Reopening a contract's chat loads the full prior session (persistent history)
- [ ] Clicking a citation chip scrolls the content viewer to that page
