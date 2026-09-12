import { describe, it, expect } from 'vitest'
import { assessAdvance, extractAdvanceMonths, isNegated, RENT_LAW } from '../services/legal/rentLaw.js'
import { describeAdvance, LEGAL_LABELS } from '../services/legal/abuseCheck.js'

/**
 * The failure this guards against: the abuse checker accusing a landlord who
 * did nothing wrong.
 *
 * Before this, the advance rule matched the bare word "advance", so a lawful
 * three-month advance was reported as a HIGH-severity crime carrying
 * imprisonment, and so was an explicit statement that no advance was
 * demanded. A tenant acting on that goes to Rent Control to accuse someone
 * innocent, which is worse than missing a real violation.
 */

describe('rent advance under Act 220 s.25', () => {
  it('treats the statutory maximum as lawful, not as a violation', () => {
    const verdict = assessAdvance(`I paid ${RENT_LAW.maxAdvanceMonths} months advance as agreed`)
    expect(verdict.kind).toBe('lawful')
  })

  it('treats one month over the maximum as a violation', () => {
    const verdict = assessAdvance(`He wants ${RENT_LAW.maxAdvanceMonths + 1} months upfront`)
    expect(verdict).toMatchObject({ kind: 'violation', months: RENT_LAW.maxAdvanceMonths + 1 })
  })

  it.each([
    ['My landlord asked for 3 months rent advance which I paid happily', 'lawful'],
    ['The advance was two months and everything went smoothly', 'lawful'],
    ['I paid two years rent advance before moving in', 'violation'],
    ['She asked for one year advance', 'violation'],
    ['He is demanding 18 months advance', 'violation'],
  ])('%s -> %s', (text, expected) => {
    expect(assessAdvance(text).kind).toBe(expected)
  })

  it('says nothing when the text denies any advance was demanded', () => {
    expect(assessAdvance('My landlord did not ask for any advance and has been fair').kind)
      .toBe('not_applicable')
    expect(assessAdvance('He never demanded advance from me').kind).toBe('not_applicable')
  })

  it('admits it cannot tell when no figure is given', () => {
    // "Unclear" is the honest answer and the common one. The old code had no
    // such state, so every mention of advance became an accusation.
    expect(assessAdvance('The rent advance situation is stressing me out').kind).toBe('unclear')
  })

  it('is silent when advance is not mentioned at all', () => {
    expect(assessAdvance('The rent is 800 cedis and everything is fine').kind).toBe('not_applicable')
  })

  it('converts years, including words, to months', () => {
    expect(extractAdvanceMonths('two years advance')?.months).toBe(24)
    expect(extractAdvanceMonths('1 year advance')?.months).toBe(12)
    expect(extractAdvanceMonths('18 months advance')?.months).toBe(18)
  })

  it('takes the largest figure when several are mentioned', () => {
    expect(extractAdvanceMonths('I offered 3 months advance but he demands 12 months advance')?.months)
      .toBe(12)
  })

  it('scopes negation tightly enough not to miss a real violation', () => {
    // "did not like" must not negate the advance clause that follows it.
    expect(assessAdvance('I did not like the flat but he asked for 12 months advance').kind)
      .toBe('violation')
  })

  it('detects negation directly before the phrase', () => {
    expect(isNegated('he did not ask for advance', 'advance')).toBe(true)
    expect(isNegated('he asked for advance', 'advance')).toBe(false)
  })
})

describe('what the tenant is told', () => {
  it('reassures when the advance is within the law', () => {
    const finding = describeAdvance('My landlord asked for 3 months rent advance')
    expect(finding?.verdict).toBe('lawful')
    expect(finding?.message).toContain('within the law')
  })

  it('states the figure and the limit when it is exceeded', () => {
    const finding = describeAdvance('He is demanding 12 months advance')
    expect(finding?.verdict).toBe('violation')
    expect(finding?.message).toContain('12 months')
    expect(finding?.message).toContain(String(RENT_LAW.maxAdvanceMonths))
  })

  it('asks for the number instead of guessing', () => {
    const finding = describeAdvance('He is asking for rent advance, is that allowed?')
    expect(finding?.verdict).toBe('unclear')
    expect(finding?.message).toMatch(/how many months|tell us the number/i)
  })

  it('returns nothing when advance was never raised', () => {
    expect(describeAdvance('The roof has been leaking for months')).toBeNull()
  })
})

describe('label table', () => {
  it('cites a provision for every label the model can emit', () => {
    // A tenant is about to act on this. Every claim needs its source.
    for (const [key, entry] of Object.entries(LEGAL_LABELS)) {
      expect(entry.law, key).toMatch(/Act|Constitution/)
      expect(entry.explanation.length, key).toBeGreaterThan(40)
      expect(['high', 'medium', 'low']).toContain(entry.severity)
    }
  })

  it('states the advance limit from the single source of truth', () => {
    expect(LEGAL_LABELS.excessive_advance.explanation)
      .toContain(`${RENT_LAW.maxAdvanceMonths} months`)
  })
})
