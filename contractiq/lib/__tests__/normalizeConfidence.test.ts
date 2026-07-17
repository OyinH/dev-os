import { describe, it, expect } from 'vitest'
import { normalizeConfidence } from '../utils/normalizeConfidence'

describe('normalizeConfidence', () => {
  it('scales 0.0 to 0', () => {
    expect(normalizeConfidence(0.0)).toBe(0)
  })
  it('scales 1.0 to 100', () => {
    expect(normalizeConfidence(1.0)).toBe(100)
  })
  it('scales 0.876 to 87.6', () => {
    expect(normalizeConfidence(0.876)).toBe(87.6)
  })
  it('clamps values above 1.0', () => {
    expect(normalizeConfidence(1.4)).toBe(100)
  })
  it('clamps negative values to 0', () => {
    expect(normalizeConfidence(-0.2)).toBe(0)
  })
})
