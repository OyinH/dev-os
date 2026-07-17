# Spec 03 — Key Term Extraction via OpenAI

**Maps to:** US-002 (extraction portion), US-003, US-004, FR-04, FR-11
**Edge Function:** `process-contract`
**Depends on:** `key_terms`, `custom_key_terms` tables; `docs/specs/13-standard-terms-and-constants-spec.md`; `docs/specs/11-shared-edge-function-utilities-spec.md`

---

## 1. User Flow

1. User clicks "Process Contract" after reviewing the standard-term preview and optionally adding up to 5 custom terms (Spec 04)
2. `process-contract` builds a few-shot prompt (standard terms for the contract type + any custom terms), calls GPT-4o at `temperature=0.1` with `response_format: json_object`
3. Response parsed: `detected_contract_type` compared to the user-selected `contract_type` (soft mismatch warning if different); each term's `confidence_score` normalized from `0.0–1.0` to `0–100`
4. Results written to `key_terms` / `custom_key_terms`; `contracts.status` set to `'completed'`
5. User redirected to the results page; terms render colour-coded by confidence

## 2. Request / Response Contract

**Endpoint:** `supabase.functions.invoke('process-contract', { body })`

**Request:**

```json
{
  "contract_id": "uuid",
  "contract_type": "NDA",
  "custom_terms": ["Non-compete radius", "Data retention period"]
}
```

`custom_terms` is optional, max length 5, each entry ≤100 chars.

**Success response `200`:**

```json
{
  "status": "completed",
  "detected_contract_type": "NDA",
  "key_terms": [
    {
      "id": "uuid",
      "term_name": "Effective Date",
      "value": "March 3, 2025",
      "page_number": 1,
      "confidence_score": 96,
      "source_sentence": "This Agreement is entered into as of March 3, 2025 (the \"Effective Date\")."
    }
  ],
  "custom_key_terms": [
    {
      "id": "uuid",
      "term_name": "Non-compete radius",
      "value": "50 miles",
      "page_number": 4,
      "confidence_score": 71,
      "source_sentence": "Employee shall not engage in competing business within a 50-mile radius..."
    }
  ]
}
```

**Error responses:**

| Status | Condition | Body |
|---|---|---|
| `422` | `custom_terms.length > 5` | `{ "error": "invalid_custom_term_count", "message": "A maximum of 5 custom terms is allowed." }` |
| `404` | `contract_id` not found / not owned (RLS) | `{ "error": "not_found" }` |
| `502` | OpenAI failure after 3 retries | `{ "error": "extraction_failed", "message": "We couldn't process this contract. Please try again." }` — `contracts.status` set to `'error'` |

## 3. JSON Schema (model output contract)

```json
{
  "detected_contract_type": "NDA | MSA",
  "terms": [
    {
      "term_name": "string — must exactly match a name from the injected standard/custom term list",
      "value": "string — the extracted value, or \"Not found\" if the clause is absent",
      "page_number": "integer, 1-indexed",
      "confidence_score": "float, 0.0–1.0",
      "source_sentence": "string — verbatim sentence the value was drawn from"
    }
  ]
}
```

A term is omitted from `terms[]` entirely (not synthesized as a placeholder) if the model cannot locate it — see Edge Cases §8.

## 4. Prompt Strategy

| Task | Technique |
|---|---|
| Standard extraction | Few-shot: 3 labelled NDA examples + 3 labelled MSA examples in the system prompt (only the examples for the requested `contract_type` are included, to keep the prompt within budget) |
| Custom term extraction | Zero-shot — term names appended to the same `terms` target list in the same call, no second API call |
| Confidence scoring | Self-reported by the model within the same call — no second inference pass |

### System prompt template — `supabase/functions/_shared/prompts/nda.ts`

```ts
export const NDA_STANDARD_TERMS = [
  'Parties',
  'Effective Date',
  'Confidentiality Obligations',
  'Permitted Disclosures',
  'Term & Duration',
  'Governing Law',
  'Jurisdiction',
  'IP Ownership',
  'Non-Solicitation',
  'Breach & Remedy',
] as const

export function buildNdaSystemPrompt(customTerms: string[]): string {
  const targetTerms = [...NDA_STANDARD_TERMS, ...customTerms]

  return `You are a contract analysis assistant. You extract structured key terms from Non-Disclosure Agreements (NDAs).

Extract values ONLY for these terms: ${targetTerms.join(', ')}.

For each term you can find in the document, return an object with:
- term_name (must exactly match one of the target terms above)
- value (the extracted value as concise text; if genuinely absent from the document, use "Not found")
- page_number (integer, 1-indexed, from the [PAGE N] markers in the document text)
- confidence_score (float 0.0–1.0, your genuine confidence in this extraction)
- source_sentence (the verbatim sentence in the document the value was drawn from)

If a term cannot be located in the document at all, OMIT it from the output entirely — do not fabricate a row.

Also return detected_contract_type: your own classification of whether this document is actually an "NDA" or an "MSA", independent of what the user selected — this may differ from the requested extraction target and is used only for a soft mismatch warning.

Respond with ONLY a JSON object matching this exact shape, no prose, no markdown fences:
{ "detected_contract_type": "NDA" | "MSA", "terms": [ { "term_name": string, "value": string, "page_number": number, "confidence_score": number, "source_sentence": string } ] }

--- EXAMPLE 1 ---
Document excerpt:
[PAGE 1]
MUTUAL NON-DISCLOSURE AGREEMENT
This Agreement is entered into as of March 3, 2025 (the "Effective Date") between Acme Robotics, Inc., a Delaware corporation ("Acme"), and Beacon Supply Co. ("Beacon").
[PAGE 2]
Each party agrees to hold the other's Confidential Information in strict confidence and not disclose it to any third party for a period of 3 years from the Effective Date.
[PAGE 2]
Disclosure is permitted where required by law, court order, or with the prior written consent of the disclosing party.

Expected output (excerpt):
{ "term_name": "Parties", "value": "Acme Robotics, Inc. and Beacon Supply Co.", "page_number": 1, "confidence_score": 0.98, "source_sentence": "This Agreement is entered into as of March 3, 2025 (the \\"Effective Date\\") between Acme Robotics, Inc., a Delaware corporation (\\"Acme\\"), and Beacon Supply Co. (\\"Beacon\\")." }
{ "term_name": "Effective Date", "value": "March 3, 2025", "page_number": 1, "confidence_score": 0.97, "source_sentence": "This Agreement is entered into as of March 3, 2025 (the \\"Effective Date\\")..." }
{ "term_name": "Term & Duration", "value": "3 years from the Effective Date", "page_number": 2, "confidence_score": 0.92, "source_sentence": "...for a period of 3 years from the Effective Date." }
{ "term_name": "Permitted Disclosures", "value": "Required by law, court order, or with prior written consent", "page_number": 2, "confidence_score": 0.9, "source_sentence": "Disclosure is permitted where required by law, court order, or with the prior written consent of the disclosing party." }

--- EXAMPLE 2 ---
Document excerpt:
[PAGE 3]
This Agreement shall be governed by the laws of the State of New York, without regard to conflict of law principles. The parties submit to the exclusive jurisdiction of the state and federal courts located in New York County.
[PAGE 4]
Neither party shall solicit or hire the other party's employees for a period of 12 months following termination of this Agreement.

Expected output (excerpt):
{ "term_name": "Governing Law", "value": "State of New York", "page_number": 3, "confidence_score": 0.95, "source_sentence": "This Agreement shall be governed by the laws of the State of New York, without regard to conflict of law principles." }
{ "term_name": "Jurisdiction", "value": "State and federal courts located in New York County", "page_number": 3, "confidence_score": 0.94, "source_sentence": "The parties submit to the exclusive jurisdiction of the state and federal courts located in New York County." }
{ "term_name": "Non-Solicitation", "value": "12 months following termination", "page_number": 4, "confidence_score": 0.9, "source_sentence": "Neither party shall solicit or hire the other party's employees for a period of 12 months following termination of this Agreement." }

--- EXAMPLE 3 ---
Document excerpt:
[PAGE 5]
All Confidential Information disclosed under this Agreement, and any derivative works thereof, shall remain the sole property of the disclosing party. No license or ownership rights are granted by virtue of this Agreement.
[PAGE 6]
In the event of a breach of this Agreement, the non-breaching party shall be entitled to seek injunctive relief in addition to any other remedies available at law or equity.

Expected output (excerpt):
{ "term_name": "IP Ownership", "value": "Remains sole property of the disclosing party; no license granted", "page_number": 5, "confidence_score": 0.93, "source_sentence": "All Confidential Information disclosed under this Agreement, and any derivative works thereof, shall remain the sole property of the disclosing party." }
{ "term_name": "Breach & Remedy", "value": "Injunctive relief plus any other remedies available at law or equity", "page_number": 6, "confidence_score": 0.91, "source_sentence": "In the event of a breach of this Agreement, the non-breaching party shall be entitled to seek injunctive relief in addition to any other remedies available at law or equity." }
--- END EXAMPLES ---`
}
```

### System prompt template — `supabase/functions/_shared/prompts/msa.ts`

```ts
export const MSA_STANDARD_TERMS = [
  'Parties',
  'Service Scope',
  'Payment Terms',
  'Invoice Schedule',
  'Late Payment Penalty',
  'Liability Cap',
  'Indemnification',
  'IP Ownership',
  'Termination Clause',
  'Governing Law',
  'Dispute Resolution',
  'Notice Period',
] as const

export function buildMsaSystemPrompt(customTerms: string[]): string {
  const targetTerms = [...MSA_STANDARD_TERMS, ...customTerms]

  return `You are a contract analysis assistant. You extract structured key terms from Master Service Agreements (MSAs).

Extract values ONLY for these terms: ${targetTerms.join(', ')}.

For each term you can find in the document, return an object with:
- term_name (must exactly match one of the target terms above)
- value (concise extracted text; "Not found" if genuinely absent)
- page_number (integer, 1-indexed, from [PAGE N] markers)
- confidence_score (float 0.0–1.0)
- source_sentence (verbatim sentence the value was drawn from)

If a term cannot be located at all, OMIT it from the output — do not fabricate a row.

Also return detected_contract_type: your own classification ("NDA" or "MSA") independent of the user's selection, used only for a soft mismatch warning.

Respond with ONLY a JSON object, no prose, no markdown fences:
{ "detected_contract_type": "NDA" | "MSA", "terms": [ { "term_name": string, "value": string, "page_number": number, "confidence_score": number, "source_sentence": string } ] }

--- EXAMPLE 1 ---
Document excerpt:
[PAGE 1]
MASTER SERVICES AGREEMENT between Northwind Consulting LLC ("Provider") and Fabrikam Retail Group ("Client"), effective as of the last signature date below.
[PAGE 2]
Provider shall deliver ongoing marketing analytics and reporting services as described in each Statement of Work. Client shall pay Provider within 30 days of receipt of each invoice.
[PAGE 2]
Invoices shall be issued monthly, on the first business day of each month, covering services rendered in the prior month.

Expected output (excerpt):
{ "term_name": "Parties", "value": "Northwind Consulting LLC and Fabrikam Retail Group", "page_number": 1, "confidence_score": 0.97, "source_sentence": "MASTER SERVICES AGREEMENT between Northwind Consulting LLC (\\"Provider\\") and Fabrikam Retail Group (\\"Client\\"), effective as of the last signature date below." }
{ "term_name": "Service Scope", "value": "Ongoing marketing analytics and reporting services per each Statement of Work", "page_number": 2, "confidence_score": 0.9, "source_sentence": "Provider shall deliver ongoing marketing analytics and reporting services as described in each Statement of Work." }
{ "term_name": "Payment Terms", "value": "Net 30 days from invoice receipt", "page_number": 2, "confidence_score": 0.95, "source_sentence": "Client shall pay Provider within 30 days of receipt of each invoice." }
{ "term_name": "Invoice Schedule", "value": "Monthly, on the first business day of each month", "page_number": 2, "confidence_score": 0.93, "source_sentence": "Invoices shall be issued monthly, on the first business day of each month, covering services rendered in the prior month." }

--- EXAMPLE 2 ---
Document excerpt:
[PAGE 4]
Late payments shall accrue interest at 1.5% per month on the outstanding balance. Provider's total liability under this Agreement shall not exceed the total fees paid by Client in the 12 months preceding the claim.
[PAGE 5]
Client shall indemnify and hold harmless Provider from any third-party claims arising out of Client's misuse of the deliverables.

Expected output (excerpt):
{ "term_name": "Late Payment Penalty", "value": "1.5% per month on outstanding balance", "page_number": 4, "confidence_score": 0.94, "source_sentence": "Late payments shall accrue interest at 1.5% per month on the outstanding balance." }
{ "term_name": "Liability Cap", "value": "Total fees paid in the preceding 12 months", "page_number": 4, "confidence_score": 0.92, "source_sentence": "Provider's total liability under this Agreement shall not exceed the total fees paid by Client in the 12 months preceding the claim." }
{ "term_name": "Indemnification", "value": "Client indemnifies Provider against third-party claims from Client's misuse of deliverables", "page_number": 5, "confidence_score": 0.89, "source_sentence": "Client shall indemnify and hold harmless Provider from any third-party claims arising out of Client's misuse of the deliverables." }

--- EXAMPLE 3 ---
Document excerpt:
[PAGE 7]
Either party may terminate this Agreement for convenience upon 60 days' written notice. This Agreement is governed by the laws of the State of California. Any dispute shall be resolved through binding arbitration in San Francisco, California.

Expected output (excerpt):
{ "term_name": "Termination Clause", "value": "Either party may terminate for convenience with 60 days' written notice", "page_number": 7, "confidence_score": 0.93, "source_sentence": "Either party may terminate this Agreement for convenience upon 60 days' written notice." }
{ "term_name": "Notice Period", "value": "60 days", "page_number": 7, "confidence_score": 0.91, "source_sentence": "Either party may terminate this Agreement for convenience upon 60 days' written notice." }
{ "term_name": "Governing Law", "value": "State of California", "page_number": 7, "confidence_score": 0.95, "source_sentence": "This Agreement is governed by the laws of the State of California." }
{ "term_name": "Dispute Resolution", "value": "Binding arbitration in San Francisco, California", "page_number": 7, "confidence_score": 0.94, "source_sentence": "Any dispute shall be resolved through binding arbitration in San Francisco, California." }
--- END EXAMPLES ---`
}
```

## 5. Implementation — `supabase/functions/process-contract/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createUserClient } from '../_shared/supabase-client.ts'
import { callOpenAIWithRetry } from '../_shared/openai.ts'
import { buildNdaSystemPrompt, NDA_STANDARD_TERMS } from '../_shared/prompts/nda.ts'
import { buildMsaSystemPrompt, MSA_STANDARD_TERMS } from '../_shared/prompts/msa.ts'

interface ExtractedTerm {
  term_name: string
  value: string
  page_number: number
  confidence_score: number
  source_sentence: string
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)
    const supabase = createUserClient(authHeader)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const { contract_id, contract_type, custom_terms = [] } = await req.json()

    if (custom_terms.length > 5) {
      return json({ error: 'invalid_custom_term_count', message: 'A maximum of 5 custom terms is allowed.' }, 422)
    }

    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('id, contract_text')
      .eq('id', contract_id)
      .single()

    if (fetchError || !contract) {
      return json({ error: 'not_found' }, 404)
    }

    const systemPrompt =
      contract_type === 'NDA'
        ? buildNdaSystemPrompt(custom_terms)
        : buildMsaSystemPrompt(custom_terms)
    const standardTerms = contract_type === 'NDA' ? NDA_STANDARD_TERMS : MSA_STANDARD_TERMS

    let parsed: { detected_contract_type: 'NDA' | 'MSA'; terms: ExtractedTerm[] }
    try {
      parsed = await extractWithJsonRetry(systemPrompt, contract.contract_text)
    } catch (err) {
      await supabase
        .from('contracts')
        .update({ status: 'error', error_message: 'Extraction failed after retries.' })
        .eq('id', contract_id)
      console.error('process-contract extraction failed', err)
      return json({ error: 'extraction_failed', message: "We couldn't process this contract. Please try again." }, 502)
    }

    const standardSet = new Set<string>(standardTerms)
    const standardRows = parsed.terms
      .filter((t) => standardSet.has(t.term_name))
      .map((t, i) => ({
        contract_id,
        term_name: t.term_name,
        value: t.value,
        page_number: t.page_number,
        confidence_score: normalizeConfidence(t.confidence_score),
        source_sentence: t.source_sentence,
        display_order: standardTerms.indexOf(t.term_name as never) ?? i,
      }))

    const customRows = parsed.terms
      .filter((t) => custom_terms.includes(t.term_name))
      .map((t, i) => ({
        contract_id,
        term_name: t.term_name,
        value: t.value,
        page_number: t.page_number,
        confidence_score: normalizeConfidence(t.confidence_score),
        source_sentence: t.source_sentence,
        is_manual: true,
        display_order: i,
      }))

    if (standardRows.length > 0) {
      const { error } = await supabase.from('key_terms').insert(standardRows)
      if (error) throw error
    }
    if (customRows.length > 0) {
      const { error } = await supabase.from('custom_key_terms').insert(customRows)
      if (error) throw error
    }

    await supabase
      .from('contracts')
      .update({
        status: 'completed',
        detected_contract_type: parsed.detected_contract_type,
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', contract_id)

    return json({
      status: 'completed',
      detected_contract_type: parsed.detected_contract_type,
      key_terms: standardRows,
      custom_key_terms: customRows,
    })
  } catch (err) {
    console.error('process-contract error', err)
    return json({ error: 'internal_error' }, 500)
  }
})

async function extractWithJsonRetry(systemPrompt: string, contractText: string) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: contractText },
  ]

  const first = await callOpenAIWithRetry({
    model: 'gpt-4o',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    max_tokens: 2000,
    messages,
  })

  try {
    return JSON.parse(first)
  } catch {
    // Single automatic retry on JSON parse failure, per engineering-doc.md §8
    const retry = await callOpenAIWithRetry({
      model: 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      messages: [
        ...messages,
        { role: 'assistant', content: first },
        { role: 'user', content: 'Your previous response was not valid JSON. Return only the JSON object, no explanation.' },
      ],
    })
    return JSON.parse(retry) // if this also fails to parse, the throw propagates to the 502 handler
  }
}

function normalizeConfidence(raw: number): number {
  // Model returns 0.0–1.0; persisted column is 0–100.
  const clamped = Math.max(0, Math.min(1, raw))
  return Math.round(clamped * 100 * 100) / 100 // 2 decimal places, matches numeric(5,2)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

## 6. State Management (frontend)

- TanStack `useMutation(['process-contract'])` → on success: `invalidateQueries(['contract', id])`, `invalidateQueries(['key-terms', id])`, `invalidateQueries(['contracts'])`
- `ProcessingProgress` (Zustand-driven step indicator): step 1 (extract) completes after Spec 02's response; step 2 (analyze) is "in progress" for the duration of this mutation; step 3 (compile) flips to done on this mutation's `onSuccess`

## 7. Component Spec

Full tree in `engineering-doc.md` §5. Specifics for this feature:

| Component | Responsibility |
|---|---|
| `ConfidenceBadge` | Colour logic: green (`--color-green-500` / `--color-green-50` bg) ≥80, amber (`--color-yellow-500` / `--color-yellow-50` bg) 50–79, red (`--color-red-500` / `--color-red-50` bg) <50 |
| `LowConfidenceWarning` | Non-dismissible shadcn `Tooltip`, rendered only when `confidence_score < 50` |
| `ContractTypeMismatchBanner` | Rendered when `detected_contract_type !== contract_type` |

## 8. Edge Cases

| Case | Behavior |
|---|---|
| OpenAI timeout/5xx | 3-attempt exponential backoff (Spec 11); on exhaustion `status='error'`, retry CTA reuses the existing `contract_id` — no re-upload |
| JSON parse failure | One automatic retry with an explicit "not valid JSON" reminder before surfacing an error |
| Model omits a standard term | Term is absent from the panel — no synthesized placeholder row; a missing term is itself informative |
| Non-contract document uploaded | All terms return low confidence; every term shows the red warning — no special-cased "not a contract" detection at MVP |
| `detected_contract_type` mismatch | Soft warning banner; extraction still proceeds and displays (graceful degradation, not a hard block) |
| Model returns a `term_name` not in the requested list | Filtered out by the `standardSet`/`custom_terms` membership check before insert — prevents schema drift into the DB |

## 9. Acceptance Criteria (US-002 extraction portion, US-003, US-004)

- [ ] Time to first extracted key-term display ≤30s P95 for ≤20-page contracts
- [ ] ≥80% of standard NDA/MSA terms return a value on a well-formed contract
- [ ] Every persisted term has a `page_number`, `confidence_score` (0–100), and `source_sentence`
- [ ] Confidence <50% renders the non-dismissible low-confidence tooltip; the term is never hidden
- [ ] A contract-type mismatch shows a soft warning without blocking display of results
