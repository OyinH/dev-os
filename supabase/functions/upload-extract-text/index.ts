import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import * as pdfjsLib from 'npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createUserClient } from '../_shared/supabase-client.ts'
import { checkRateLimit } from '../_shared/security/rateLimiter.ts'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_PAGES = 20
const MAX_TOKENS = 15_000
const MIN_WORDS = 100
// Rough approximation: 1 token ≈ 4 chars of English text (avoids pulling a full tokenizer into the Edge runtime)
const TOKENS_PER_CHAR = 1 / 4

// Mirrors contractiq/lib/security/inputValidator.ts — client-side validation
// there is UX only, this is the authoritative check.
const ALLOWED_EXTENSIONS = ['.pdf']
const BLOCKED_EXTENSIONS = ['.exe', '.js', '.mjs', '.cjs', '.php', '.zip', '.sh', '.bat', '.cmd', '.py', '.rb', '.ps1']

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

    const rateLimit = await checkRateLimit(user.id, 'contract_upload')
    if (!rateLimit.allowed) {
      return json(
        { error: 'rate_limited', message: 'Upload limit reached. Please try again later.' },
        429,
        { 'Retry-After': String(rateLimit.retryAfterSeconds) }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const contractType = formData.get('contract_type') as string | null
    const rawFilename = formData.get('filename') as string | null

    if (!file || !contractType || !rawFilename) {
      return json({ error: 'missing_field', message: 'file, contract_type, and filename are required.' }, 400)
    }
    if (!['NDA', 'MSA'].includes(contractType)) {
      return json({ error: 'missing_field', message: 'contract_type must be NDA or MSA.' }, 400)
    }

    // Strip any directory components from the client-supplied filename
    // before it's ever used to build a Storage object path — an untrusted
    // "../../other-contract/evil.pdf" style value must not be able to steer
    // where inside the caller's own storage prefix the object lands.
    const filename = rawFilename.replace(/^.*[\\/]/, '')
    const lowerName = filename.toLowerCase()
    const extension = lowerName.slice(lowerName.lastIndexOf('.'))

    // Validate in the required order: extension (blocklist, then allowlist)
    // → MIME type → file size.
    if (BLOCKED_EXTENSIONS.includes(extension)) {
      return json({ error: 'blocked_file_type', message: 'This file type is not allowed.' }, 415)
    }
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return json({ error: 'invalid_file_type', message: 'Only PDF files are supported.' }, 415)
    }
    if (file.type !== 'application/pdf') {
      return json({ error: 'invalid_file_type', message: 'Only PDF files are supported.' }, 415)
    }
    if (file.size > MAX_FILE_BYTES) {
      return json({ error: 'file_too_large', message: 'File exceeds the 10MB limit.' }, 413)
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

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  })
}
