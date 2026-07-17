import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createUserClient } from '../_shared/supabase-client.ts'
import { checkRateLimit } from '../_shared/security/rateLimiter.ts'
import { checkChatMessageLength } from '../_shared/security/tokenLimiter.ts'
import { sanitizeForLLM, PromptInjectionError } from '../_shared/security/promptInjectionGuard.ts'
import { verifyContractReadyForChat } from '../_shared/security/chatSecurity.ts'
import { callOpenAIWithRetry } from '../_shared/openai.ts'
import { classifyQuery, type QueryClassification } from '../_shared/classify-query.ts'
import { buildChatSystemPrompt, toOpenAIMessages } from '../_shared/prompts/chat.ts'

// CONTRACT/BOTH answers need the document plus a shorter window of recent
// turns for context. HISTORY answers have nothing else to draw on, so they
// get a deeper window instead.
const CONTRACT_HISTORY_TURNS = 10
const HISTORY_ONLY_TURNS = 20
const PAGE_CITATION_RE = /\[Page\s+(\d+)\]/gi

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)
    const supabase = createUserClient(authHeader)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const rateLimit = await checkRateLimit(user.id, 'chat')
    if (!rateLimit.allowed) {
      return json(
        { error: 'rate_limited', message: 'Too many messages. Please slow down.' },
        429,
        { 'Retry-After': String(rateLimit.retryAfterSeconds) }
      )
    }

    const { contract_id, session_id, message } = await req.json()

    if (!message || !message.trim()) {
      return json({ error: 'empty_message' }, 422)
    }

    const lengthCheck = checkChatMessageLength(message)
    if (!lengthCheck.valid) {
      return json({ error: 'message_too_long', message: lengthCheck.reason }, 422)
    }

    const readiness = await verifyContractReadyForChat(supabase, contract_id, user.id)
    if (!readiness.ok) return json({ error: 'not_found' }, 404)

    let sanitizedMessage: string
    try {
      sanitizedMessage = sanitizeForLLM(message)
    } catch (err) {
      if (err instanceof PromptInjectionError) {
        return json({ error: 'prompt_injection', message: 'This message could not be processed.' }, 400)
      }
      throw err
    }

    // CLASSIFY — a pure function of the new message text. Never touches
    // chat_messages, so it can happen before we've resolved a session.
    const classification = classifyQuery(sanitizedMessage)

    // Resolve (but do not write into) the session so history can be read
    // next. Creating an empty session row is not "saving the message."
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

    // RETRIEVE — load history from the DB before the new message is saved.
    // If this ran after the insert below, the message we're about to answer
    // would already be sitting in its own history window.
    const turnLimit = classification === 'history' ? HISTORY_ONLY_TURNS : CONTRACT_HISTORY_TURNS
    const historyRows = await fetchRecentHistory(supabase, sessionId, turnLimit)

    // A pure HISTORY question has nothing to do with the document, so skip
    // fetching (and paying context-window cost for) the contract text.
    let contractText = ''
    if (classification !== 'history') {
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select('contract_text')
        .eq('id', contract_id)
        .single()
      if (contractError || !contract) return json({ error: 'not_found' }, 404)
      contractText = contract.contract_text
    }

    // Only now is it safe to persist the user's message.
    await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'user', content: sanitizedMessage })

    const systemPrompt = buildChatSystemPrompt(contractText, classification)
    const conversation = [...toOpenAIMessages(historyRows), { role: 'user', content: sanitizedMessage }]

    const responseText = await requestChatCompletionWithAttributionRetry(systemPrompt, conversation, classification)

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
      session_id: sessionId,
      role: 'assistant',
      content: responseText,
      cited_pages: citedPages,
      source: classification,
      created_at: assistantMessage.created_at,
    })
  } catch (err) {
    console.error('chat-message error', err)
    return json({ error: 'chat_failed', message: "We couldn't get a response. Please try again." }, 502)
  }
})

async function fetchRecentHistory(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sessionId: string,
  limit: number
): Promise<{ role: string; content: string }[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).reverse()
}

const ATTRIBUTION_REMINDERS: Record<QueryClassification, string> = {
  contract: 'Your response must include a page citation in the exact format [Page X]. Please try again.',
  history: 'Your response must end with the exact tag [From conversation]. Please try again.',
  both: 'Your response must attribute each fact to its source using [Page X] for the document or [From conversation] for the conversation. Please try again.',
}

async function requestChatCompletionWithAttributionRetry(
  systemPrompt: string,
  history: { role: string; content: string }[],
  classification: QueryClassification
): Promise<string> {
  const messages = [{ role: 'system', content: systemPrompt }, ...history]

  const first = await callOpenAIWithRetry({
    model: 'gpt-4o',
    temperature: 0.4,
    max_tokens: 1000,
    messages,
  })

  if (hasRequiredAttribution(first, classification)) return first

  // Malformed response: missing the mandatory attribution. One retry, same
  // pattern as extraction's JSON retry.
  const retry = await callOpenAIWithRetry({
    model: 'gpt-4o',
    temperature: 0.4,
    max_tokens: 1000,
    messages: [
      ...messages,
      { role: 'assistant', content: first },
      { role: 'user', content: ATTRIBUTION_REMINDERS[classification] },
    ],
  })
  return retry
}

function hasRequiredAttribution(text: string, classification: QueryClassification): boolean {
  PAGE_CITATION_RE.lastIndex = 0
  const hasCitation = PAGE_CITATION_RE.test(text)
  const hasConversationTag = text.includes('[From conversation]')

  if (classification === 'history') return hasConversationTag
  if (classification === 'both') return hasCitation || hasConversationTag
  return hasCitation || text.includes('I cannot find this in the document')
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

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  })
}
