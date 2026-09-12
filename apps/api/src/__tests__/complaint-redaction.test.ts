import { describe, it, expect } from 'vitest'
import { redactComplaint } from '../services/legal/redact.js'

/**
 * The abuse checker is a public, unauthenticated form. Storing what people
 * type there to improve the model would otherwise build a searchable file of
 * private housing disputes naming identifiable people — including landlords
 * accused of crimes in them.
 */

describe('redaction', () => {
  it.each([
    ['0244123456', 'phone'],
    ['024 412 3456', 'phone'],
    ['+233 24 412 3456', 'phone'],
    ['+233244123456', 'phone'],
  ])('removes Ghanaian phone numbers: %s', (phone) => {
    const { text } = redactComplaint(`Call me on ${phone} about the eviction`)
    expect(text).not.toContain('4123456')
    expect(text).toContain('[phone]')
  })

  it('removes email addresses', () => {
    const { text, removed } = redactComplaint('Write to kwame.mensah@example.com please')
    expect(text).not.toContain('@example.com')
    expect(removed.email).toBe(1)
  })

  it('removes GhanaPost digital addresses', () => {
    const { text } = redactComplaint('The house is GA-492-2894 near the station')
    expect(text).not.toContain('GA-492-2894')
    expect(text).toContain('[address]')
  })

  it('removes street addresses', () => {
    const { text } = redactComplaint('I live at 14 Jungle Road and the roof leaks')
    expect(text).not.toContain('Jungle Road')
    expect(text).toContain('[address]')
  })

  it.each([
    'My Ghana Card is GHA12345678',
    'Card GHA-123456789-0 attached',
    'my TIN is P0012345678',
  ])('removes identifiers whose digits are attached to letters: %s', (input) => {
    // \b\d{7,}\b misses all of these — there is no word boundary between
    // "A" and "1" — so an unseparated card number passed through untouched.
    const { text } = redactComplaint(input)
    expect(text).not.toMatch(/\d{6,}/)
  })

  it('removes long digit runs such as account numbers', () => {
    const { text } = redactComplaint('My account is 0123456789')
    expect(text).not.toContain('0123456789')
  })

  it('does not mistake a currency amount for an identifier', () => {
    const { text } = redactComplaint('The rent is GHS 8000 per month')
    expect(text).toContain('GHS 8000')
  })

  it('KEEPS the month and year quantities the model depends on', () => {
    // The single most important thing in the whole feature is the number of
    // months of advance. Redacting it would break the statutory check.
    const { text } = redactComplaint('My landlord demanded 12 months advance and 2 years rent')
    expect(text).toContain('12 months')
    expect(text).toContain('2 years')
  })

  it('keeps a lawful advance figure intact', () => {
    const { text } = redactComplaint('He asked for 3 months advance which I paid')
    expect(text).toContain('3 months')
  })

  it('preserves the shape of the complaint', () => {
    const { text } = redactComplaint(
      'My landlord at 14 Jungle Road (call 0244123456) changed the locks and wants 12 months advance',
    )
    expect(text).toContain('changed the locks')
    expect(text).toContain('12 months advance')
    expect(text).not.toContain('0244123456')
    expect(text).not.toContain('Jungle Road')
  })

  it('reports what it removed without echoing the values', () => {
    const { removed } = redactComplaint('Call 0244123456 or mail a@b.com about GA-492-2894')
    expect(removed).toMatchObject({ phone: 1, email: 1, digitalAddress: 1 })
    // Counts only — the values must not travel with the audit trail.
    expect(JSON.stringify(removed)).not.toContain('0244')
  })

  it('leaves text with nothing to redact unchanged', () => {
    const input = 'My landlord refuses to fix the leaking roof'
    const { text, removed } = redactComplaint(input)
    expect(text).toBe(input)
    expect(removed).toEqual({})
  })

  it('does not mangle an empty or whitespace complaint', () => {
    expect(redactComplaint('   ').text).toBe('')
  })
})
