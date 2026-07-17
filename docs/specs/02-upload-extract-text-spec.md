# Spec 02 — PDF Upload & Text Extraction

**Maps to:** US-002 (upload portion), FR-02, FR-03
**Edge Function:** `upload-extract-text`
**Depends on:** `contracts` table (`docs/specs/supabase-schema.sql`), `docs/specs/11-shared-edge-function-utilities-spec.md`

---

## 1. Highest-risk item in this spec

`pdf-parse` is Node-only; Supabase Edge Functions run on Deno. This function uses **`pdfjs-dist` via an `npm:` specifier**, which Deno's Node compatibility layer supports as of Supabase Edge Runtime (Deno 1.x+). Validate this locally with `supabase functions serve` before relying on it in production. **Documented fallback:** if `pdfjs-dist` proves incompatible at runtime, move text extraction to a Node-runtime Next.js Route Handler (`app/api/upload-extract-text/route.ts`) using `pdf-parse`, called from the client instead of `functions.invoke()`. The rest of this spec (validation rules, DB writes, response contract) is unchanged either way.

## 2. User Flow

1. User selects contract type (NDA/MSA) on `/upload`
2. Drags/drops or file-picks a PDF
3. Client-side pre-validation: MIME type `application/pdf`, size ≤10MB — rejected immediately if either fails, no network call made
4. `upload-extract-text` invoked with the file, `contract_type`, `filename`
5. Function parses PDF text with `[PAGE N]` markers, re-validates size/MIME/page-count/word-count/token-count server-side, writes a `contracts` row (`status='processing'`), uploads raw PDF bytes to Storage (non-blocking — failure here does not fail the request)
6. Response returns `contract_id`; wizard advances to the term-preview step (Spec 04)

## 3. Request / Response Contract

**Endpoint:** `supabase.functions.invoke('upload-extract-text', { body: formData })`

**Request:** `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `file` | binary | PDF bytes |
| `contract_type` | `'NDA' \| 'MSA'` | User-selected |
| `filename` | string | Original filename, used to derive `contracts.title` |

**Success response `200`:**

```json
{
  "contract_id": "uuid",
  "status": "processing",
  "page_count": 12,
  "token_count": 8421,
  "storage_warning": null
}
```

`storage_warning` is a non-null string (e.g. `"PDF could not be stored; the review will use text-only view."`) when the Storage upload step failed but text extraction succeeded — the request still returns `200`.

**Error responses:**

| Status | Condition | Body |
|---|---|---|
| `400` | Missing `file` / `contract_type` / `filename` | `{ "error": "missing_field", "message": "..." }` |
| `413` | File >10MB | `{ "error": "file_too_large", "message": "File exceeds the 10MB limit." }` |
| `415` | MIME type not `application/pdf` | `{ "error": "invalid_file_type", "message": "Only PDF files are supported." }` |
| `422` | Extracted text <100 words (scanned/image PDF) | `{ "error": "scanned_pdf_unsupported", "message": "Scanned PDFs are not supported yet." }` |
| `422` | Page count >20 | `{ "error": "page_limit_exceeded", "message": "Contracts longer than 20 pages are not supported yet." }` |
| `422` | Token count >~15,000 | `{ "error": "token_limit_exceeded", "message": "This contract is too long for the current version." }` |
| `422` | PDF corrupted / unparseable | `{ "error": "unparseable_pdf", "message": "We couldn't read this file. Please check it isn't corrupted and try again." }` |
| `401` | No/invalid JWT | Standard Supabase Auth error |

## 4. Implementation — `supabase/functions/upload-extract-text/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import * as pdfjsLib from 'npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createUserClient } from '../_shared/supabase-client.ts'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_PAGES = 20
const MAX_TOKENS = 15_000
const MIN_WORDS = 100
// Rough approximation: 1 token ≈ 4 chars of English text (avoids pulling a full tokenizer into the Edge runtime)
const TOKENS_PER_CHAR = 1 / 4

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'unauthorized' }, 401)
    }
    const supabase = createUserClient(authHeader)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const contractType = formData.get('contract_type') as string | null
    const filename = formData.get('filename') as string | null

    if (!file || !contractType || !filename) {
      return json({ error: 'missing_field', message: 'file, contract_type, and filename are required.' }, 400)
    }
    if (!['NDA', 'MSA'].includes(contractType)) {
      return json({ error: 'missing_field', message: 'contract_type must be NDA or MSA.' }, 400)
    }
    if (file.size > MAX_FILE_BYTES) {
      return json({ error: 'file_too_large', message: 'File exceeds the 10MB limit.' }, 413)
    }
    if (file.type !== 'application/pdf') {
      return json({ error: 'invalid_file_type', message: 'Only PDF files are supported.' }, 415)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    let extracted: { text: string; pageCount: number }
    try {
      extracted = await extractTextWithPageMarkers(bytes)
    } catch {
      return json({ error: 'unparseable_pdf', message: "We couldn't read this file. Please check it isn't corrupted and try again." }, 422)
    }

    const wordCount = extracted.text.split(/\s+/).filter(Boolean).length
    if (wordCount < MIN_WORDS) {
      return json({ error: 'scanned_pdf_unsupported', message: 'Scanned PDFs are not supported yet.' }, 422)
    }
    if (extracted.pageCount > MAX_PAGES) {
      return json({ error: 'page_limit_exceeded', message: 'Contracts longer than 20 pages are not supported yet.' }, 422)
    }

    const tokenCount = Math.ceil(extracted.text.length * TOKENS_PER_CHAR)
    if (tokenCount > MAX_TOKENS) {
      return json({ error: 'token_limit_exceeded', message: 'This contract is too long for the current version.' }, 422)
    }

    const title = filename.replace(/\.pdf$/i, '')

    const { data: contract, error: insertError } = await supabase
      .from('contracts')
      .insert({
        user_id: user.id,
        title,
        contract_type: contractType,
        contract_text: extracted.text,
        page_count: extracted.pageCount,
        token_count: tokenCount,
        status: 'processing',
      })
      .select()
      .single()

    if (insertError || !contract) {
      return json({ error: 'insert_failed', message: 'Could not create the contract record.' }, 500)
    }

    // Storage upload is non-blocking: failure here must never fail the request.
    let storageWarning: string | null = null
    const objectPath = `${user.id}/${contract.id}/${filename}`
    const { error: storageError } = await supabase.storage
      .from('contracts')
      .upload(objectPath, bytes, { contentType: 'application/pdf', upsert: false })

    if (storageError) {
      storageWarning = 'PDF could not be stored; the review will use text-only view.'
    } else {
      await supabase.from('contracts').update({ file_path: objectPath }).eq('id', contract.id)
    }

    return json({
      contract_id: contract.id,
      status: 'processing',
      page_count: extracted.pageCount,
      token_count: tokenCount,
      storage_warning: storageWarning,
    })
  } catch (err) {
    console.error('upload-extract-text error', err)
    return json({ error: 'internal_error', message: 'Something went wrong. Please try again.' }, 500)
  }
})

async function extractTextWithPageMarkers(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map((item: { str: string }) => item.str).join(' ')
    pageTexts.push(`[PAGE ${i}]\n${pageText}`)
  }

  return { text: pageTexts.join('\n\n'), pageCount: doc.numPages }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

## 4a. Ordering note: validation before insert

Notice all `422`/`413`/`415` checks happen **before** the `contracts` row is inserted. This means a rejected upload never creates a stray `processing` row — there is nothing to clean up on validation failure, and the "corrupted/unparseable PDF" edge case never leaves a contract in limbo.

## 5. State Management (frontend)

- Zustand `uploadWizardStore`: `step`, `contractType`, `selectedFile`
- TanStack `useMutation(['upload-contract'])` → on success: `queryClient.setQueryData(['contract', contract_id], data)`, `queryClient.invalidateQueries(['contracts'])`

## 6. Component Spec

| Component | Responsibility |
|---|---|
| `UploadWizard` | Container, reads/writes `step` from Zustand |
| `ContractTypeSelect` | shadcn `Select`, NDA/MSA |
| `FileDropzone` | Drag/drop + file-pick, client-side MIME/size validation before invoking the mutation |
| `ProcessingProgress` | shadcn `Progress`, 3-step indicator (extracting → analyzing → compiling); step 1 completes when this function resolves |

## 7. Design

Dropzone: `border: 1px dashed var(--color-grey-200)`, `background: var(--bg-surface)`; on drag-over: `border-color: var(--brand)`, `background: var(--color-blue-50)` (per `docs/design.md` interaction states).

## 8. Edge Cases

| Case | Behavior |
|---|---|
| File >10MB | Rejected client-side before upload starts |
| Non-PDF file | Rejected client-side (MIME + extension), re-validated server-side — client validation is never trusted alone |
| PDF >20 pages | Rejected server-side after parsing (page count only known post-extraction) |
| Scanned/image PDF | `422 scanned_pdf_unsupported`; no `contracts` row created |
| Token count >15k | `422 token_limit_exceeded`; no `contracts` row created |
| Storage upload fails, text extraction succeeds | `file_path` stays `null`, `status` proceeds normally; results page falls back to `TextViewerFallback` (Spec 05) — must never block the AI pipeline |
| Corrupted/unparseable PDF | Caught before insert; user sees a distinct retry-upload message (not the scanned-PDF message) |
| User navigates away mid-upload | In-flight request is not cancelled server-side (Edge Function completes independently); if the user returns to the dashboard the contract appears in `processing` state |

## 9. Acceptance Criteria (US-002, upload portion)

- [ ] Upload accepts files up to 10MB; rejects larger files client-side with a clear message
- [ ] Non-PDF files are rejected before any network call
- [ ] A valid ≤20-page PDF completes extraction and returns `contract_id` within the P95 latency budget feeding into Spec 03's ≤30s end-to-end target
- [ ] Scanned PDFs are rejected with the exact copy "Scanned PDFs are not supported yet."
- [ ] A Storage failure never prevents a contract from reaching `status='completed'` via Spec 03
