import { describe, it, expect } from 'vitest'
import { classifyQuery } from '../chat/classifyQuery'

describe('classifyQuery', () => {
  it('defaults to contract when no keywords match', () => {
    expect(classifyQuery('What is the payment schedule?')).toBe('contract')
  })
  it('classifies a history-only signal', () => {
    expect(classifyQuery('What did you say earlier?')).toBe('history')
  })
  it('classifies a mixed history + contract signal as both', () => {
    expect(classifyQuery('What did you say earlier about the termination clause?')).toBe('both')
  })
  it('classifies an explicit contract keyword as contract', () => {
    expect(classifyQuery('What does the indemnification provision say?')).toBe('contract')
  })
  it('classifies "what have I asked you so far" as history', () => {
    expect(classifyQuery('What have I asked you so far')).toBe('history')
  })
  it('classifies a recap request without the word "asked" as history', () => {
    expect(classifyQuery('summarize all the questions I have asked you so far')).toBe('history')
  })
  it('classifies a reference to "this conversation" as history', () => {
    expect(classifyQuery('Can you recap this conversation?')).toBe('history')
  })
})
