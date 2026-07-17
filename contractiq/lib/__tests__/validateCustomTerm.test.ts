import { describe, it, expect } from 'vitest'
import { validateCustomTerm } from '../validation/customTerm'

const standardTerms = ['Parties', 'Effective Date']

describe('validateCustomTerm', () => {
  it('rejects an empty name', () => {
    expect(validateCustomTerm('', [], standardTerms)).toEqual({
      valid: false,
      error: 'Term name cannot be empty.',
    })
  })
  it('rejects a whitespace-only name', () => {
    expect(validateCustomTerm('   ', [], standardTerms).valid).toBe(false)
  })
  it('rejects a name over 100 characters', () => {
    const long = 'a'.repeat(101)
    expect(validateCustomTerm(long, [], standardTerms).valid).toBe(false)
  })
  it('accepts a name at exactly 100 characters', () => {
    const exact = 'a'.repeat(100)
    expect(validateCustomTerm(exact, [], standardTerms).valid).toBe(true)
  })
  it('rejects a case-insensitive duplicate of a standard term', () => {
    expect(validateCustomTerm('parties', [], standardTerms).valid).toBe(false)
  })
  it('rejects a case-insensitive duplicate of an existing custom term', () => {
    expect(validateCustomTerm('Non-Compete', ['non-compete'], standardTerms).valid).toBe(false)
  })
  it('accepts a valid, non-duplicate term', () => {
    expect(validateCustomTerm('Non-compete radius', [], standardTerms)).toEqual({ valid: true })
  })
})
