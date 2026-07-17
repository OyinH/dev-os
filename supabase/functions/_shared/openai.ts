interface ChatCompletionRequest {
  model: string
  temperature: number
  max_tokens: number
  messages: { role: string; content: string }[]
  response_format?: { type: 'json_object' }
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

export async function callOpenAIWithRetry(request: ChatCompletionRequest): Promise<string> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (response.status === 429 || response.status >= 500) {
        throw new RetryableError(`OpenAI returned ${response.status}`)
      }
      if (!response.ok) {
        // Non-retryable client error (e.g. 400 bad request) — fail immediately.
        const body = await response.text()
        throw new Error(`OpenAI request failed: ${response.status} ${body}`)
      }

      const data = await response.json()
      return data.choices[0].message.content as string
    } catch (err) {
      lastError = err
      const isRetryable = err instanceof RetryableError || err instanceof TypeError // TypeError: network failure
      if (!isRetryable || attempt === MAX_ATTEMPTS) break

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

class RetryableError extends Error {}
