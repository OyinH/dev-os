// Single source of truth for standard term lists on the frontend. Must stay
// in sync with NDA_STANDARD_TERMS/MSA_STANDARD_TERMS in
// supabase/functions/_shared/prompts/{nda,msa}.ts — duplicated intentionally
// since Deno Edge Functions and the Next.js app share no module boundary.

export const NDA_TERMS = [
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

export const MSA_TERMS = [
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

export type NdaTermName = (typeof NDA_TERMS)[number]
export type MsaTermName = (typeof MSA_TERMS)[number]

export function standardTermsFor(contractType: 'NDA' | 'MSA'): readonly string[] {
  return contractType === 'NDA' ? NDA_TERMS : MSA_TERMS
}

export const MAX_CUSTOM_TERMS = 5
export const CUSTOM_TERM_MAX_LENGTH = 100
export const LOW_CONFIDENCE_THRESHOLD = 50
export const MEDIUM_CONFIDENCE_THRESHOLD = 80

export function confidenceColor(score: number): 'success' | 'warning' | 'error' {
  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return 'success'
  if (score >= LOW_CONFIDENCE_THRESHOLD) return 'warning'
  return 'error'
}
