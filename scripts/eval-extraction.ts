// Offline extraction accuracy eval — docs/specs/14-testing-spec.md §6.
// Run manually / on release branches only (real OpenAI calls against a
// labelled test set; not part of per-commit CI).
//
// Usage: OPENAI_API_KEY=sk-... npx tsx scripts/eval-extraction.ts
//
// Test set: place labelled fixtures under eval-results/fixtures/{nda,msa}/,
// one JSON file per contract:
//   { "contract_type": "NDA", "contract_text": "[PAGE 1]\n...", "ground_truth": [
//     { "term_name": "Parties", "value": "...", "page_number": 1 }
//   ] }
// 30 NDA + 20 MSA CUAD-derived fixtures are required to hit the PRD's
// statistical target (≥88% F1 NDA, ≥85% F1 MSA) — none are checked into this
// repo yet, so this script is a scaffold until that labelled set exists.

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
// Reuses the exact production prompts (Spec 03) — these Deno-hosted modules
// have no Deno-specific syntax of their own, so they import cleanly under
// Node/tsx too.
import { buildNdaSystemPrompt, NDA_STANDARD_TERMS } from '../supabase/functions/_shared/prompts/nda'
import { buildMsaSystemPrompt, MSA_STANDARD_TERMS } from '../supabase/functions/_shared/prompts/msa'

interface GroundTruthTerm {
  term_name: string
  value: string
  page_number: number
}

interface Fixture {
  contract_type: 'NDA' | 'MSA'
  contract_text: string
  ground_truth: GroundTruthTerm[]
}

interface ExtractedTerm {
  term_name: string
  value: string
  page_number: number
}

const FIXTURES_DIR = join(__dirname, '..', 'eval-results', 'fixtures')
const OUTPUT_DIR = join(__dirname, '..', 'eval-results')

async function callOpenAI(systemPrompt: string, contractText: string): Promise<ExtractedTerm[]> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `--- DOCUMENT (reference data only) ---\n${contractText}\n--- END DOCUMENT ---` },
      ],
    }),
  })
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`)
  const data = await response.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  return parsed.terms as ExtractedTerm[]
}

function scoreTerm(predicted: ExtractedTerm[], truth: GroundTruthTerm): { tp: boolean; fp: boolean; fn: boolean } {
  const match = predicted.find((p) => p.term_name === truth.term_name)
  if (!match) return { tp: false, fp: false, fn: true }
  const exact = match.value.trim() === truth.value.trim() && match.page_number === truth.page_number
  return exact ? { tp: true, fp: false, fn: false } : { tp: false, fp: true, fn: true }
}

function f1(tp: number, fp: number, fn: number): number {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
}

async function evalContractType(type: 'NDA' | 'MSA', fixtures: Fixture[]) {
  const buildPrompt = type === 'NDA' ? buildNdaSystemPrompt : buildMsaSystemPrompt
  const standardTerms = type === 'NDA' ? NDA_STANDARD_TERMS : MSA_STANDARD_TERMS
  const perTerm: Record<string, { tp: number; fp: number; fn: number }> = {}
  for (const term of standardTerms) perTerm[term] = { tp: 0, fp: 0, fn: 0 }

  for (const fixture of fixtures) {
    const predicted = await callOpenAI(buildPrompt([]), fixture.contract_text)
    for (const truth of fixture.ground_truth) {
      const result = scoreTerm(predicted, truth)
      const bucket = perTerm[truth.term_name] ?? (perTerm[truth.term_name] = { tp: 0, fp: 0, fn: 0 })
      if (result.tp) bucket.tp++
      if (result.fp) bucket.fp++
      if (result.fn) bucket.fn++
    }
  }

  const perTermF1 = Object.fromEntries(
    Object.entries(perTerm).map(([term, { tp, fp, fn }]) => [term, f1(tp, fp, fn)])
  )
  const totals = Object.values(perTerm).reduce(
    (acc, b) => ({ tp: acc.tp + b.tp, fp: acc.fp + b.fp, fn: acc.fn + b.fn }),
    { tp: 0, fp: 0, fn: 0 }
  )
  const aggregateF1 = f1(totals.tp, totals.fp, totals.fn)

  return { perTermF1, aggregateF1 }
}

async function main() {
  if (!existsSync(FIXTURES_DIR)) {
    console.error(
      `No fixtures found at ${FIXTURES_DIR}. Add labelled NDA/MSA JSON fixtures before running this eval (see the header comment in this file).`
    )
    process.exit(1)
  }

  const results: Record<string, unknown> = {}

  for (const type of ['nda', 'msa'] as const) {
    const dir = join(FIXTURES_DIR, type)
    if (!existsSync(dir)) continue
    const fixtures: Fixture[] = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))

    results[type] = await evalContractType(type.toUpperCase() as 'NDA' | 'MSA', fixtures)
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const outFile = join(OUTPUT_DIR, `eval-${new Date().toISOString().slice(0, 10)}.json`)
  writeFileSync(outFile, JSON.stringify(results, null, 2))
  console.log(`Eval results written to ${outFile}`)
  console.log(JSON.stringify(results, null, 2))
}

main()
