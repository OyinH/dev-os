import { describe, it, expect } from 'vitest'
import { confidenceColor } from '../constants/standard-terms'

describe('confidenceColor', () => {
  it('returns error below the low threshold', () => {
    expect(confidenceColor(49)).toBe('error')
  })
  it('returns warning exactly at the low threshold', () => {
    expect(confidenceColor(50)).toBe('warning')
  })
  it('returns warning below the medium threshold', () => {
    expect(confidenceColor(79)).toBe('warning')
  })
  it('returns success exactly at the medium threshold', () => {
    expect(confidenceColor(80)).toBe('success')
  })
  it('returns success above the medium threshold', () => {
    expect(confidenceColor(95)).toBe('success')
  })
})
