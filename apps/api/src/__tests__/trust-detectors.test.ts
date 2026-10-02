/**
 * TRUST-2 normalizer and detectors (spec §5, §6.1): the structural layer that
 * every enforced block rests on.
 */
import { describe, expect, it } from 'vitest'
import { normalize, numberWordsToDigits, digitLikeRuns, splitJoinedNumberWords, wildcardRuns } from '../services/trust/normalizer.js'
import { runDetectors, phonePlausibility, maskForAudit, isSafeLink } from '../services/trust/detectors.js'

const kinds = (text: string) => runDetectors(normalize(text)).hits.map((h) => h.detector)
const blocksStructurally = (text: string) => runDetectors(normalize(text)).hits.some((h) =>
  (h.kind === 'phone' && h.confidence >= 0.85) || (h.kind === 'email' && h.confidence >= 0.85) ||
  (h.kind === 'handle' && h.detector !== 'handle.at' && h.confidence >= 0.85) || (h.kind === 'domain' && h.confidence >= 0.8))

describe('normalizer', () => {
  it('turns number-word runs into digits and leaves prose alone', () => {
    expect(numberWordsToDigits('call zero two four four one two three four five six now')).toBe('call 0244123456 now')
    expect(numberWordsToDigits('go to the house for viewing')).toBe('go to the house for viewing')
    expect(numberWordsToDigits('the lease runs from 2026 to 2029')).toBe('the lease runs from 2026 to 2029')
    expect(numberWordsToDigits('and 1048 too')).toBe('and 1048 too')
    expect(numberWordsToDigits('zero two double four one')).toBe('02441')
  })

  it('treats edge weak words as prose but keeps them in a number that needs them', () => {
    expect(numberWordsToDigits('call zero two three seven four five nine two nine one for viewing')).toBe('call 0237459291 for viewing')
    expect(normalize('oh to five o ate ate fore zero fore too').numberRunCandidates).toContain('0250884042')
  })

  it('splits number words written without spaces, but not ordinary words', () => {
    expect(splitJoinedNumberWords('zerotwofourfour')).toEqual(['zero', 'two', 'four', 'four'])
    expect(splitJoinedNumberWords('someone')).toBeNull()
    expect(splitJoinedNumberWords('anyoneelse')).toBeNull()
  })

  it('folds homoglyphs, full-width digits and zero-width characters', () => {
    const views = normalize('О2４I23４567​')
    expect(views.homoglyphsFound).toBe(true)
    expect(digitLikeRuns(views.original.normalize('NFKC').replace('О', 'O'))).toContain('0241234567')
  })

  it('reads symbol runs both as stand-ins and as separators', () => {
    expect(digitLikeRuns('0@2$7-0^4 8 3 1 9')).toEqual(expect.arrayContaining(['027048319']))
    expect(digitLikeRuns('OK PRICE: 0$061732Z1 THANKS')).toContain('0506173221')
    expect(wildcardRuns('0@2$7-0^4 8 3 1 9').some((p) => p.includes('?'))).toBe(true)
  })

  it('recovers verbal emails', () => {
    expect(normalize('kofi at gmail dot com').verbalEmail).toContain('kofi@gmail.com')
    expect(normalize('kofi[at]gmail[dot]com').verbalEmail).toContain('kofi@gmail.com')
  })
})

describe('phone plausibility', () => {
  it('knows the Ghana numbering plan', () => {
    expect(phonePlausibility('0244123456')?.detector).toBe('phone.gh_mobile')
    expect(phonePlausibility('233244123456')?.detector).toBe('phone.gh_mobile_intl')
    expect(phonePlausibility('0302123456')?.detector).toBe('phone.gh_landline')
    expect(phonePlausibility('244123456')?.detector).toBe('phone.gh_mobile_no_zero')
    expect(phonePlausibility('0144123456')?.detector).not.toBe('phone.gh_mobile')
  })

  it('reads a foreign number only from an explicit international form', () => {
    expect(phonePlausibility('447911123456')?.detector).not.toBe('phone.international')
    expect(phonePlausibility('447911123456', { explicitIntl: true })?.detector).toBe('phone.international')
    expect(phonePlausibility('00447911123456')?.detector).toBe('phone.international')
  })
})

describe('detectors', () => {
  it.each([
    'My number is 0244123456', '+233 24 412 3456', '024-412-3456', 'kofi.mensah@gmail.com', 'my IG is @kofi_homes',
    'wa.me/233244123456', 't.me/kofihomes', 'linktr.ee/kofihomes', 'insta kofi_homes', 'search kofi_homes on facebook',
    'my gmail is kofimensah22', 'zero two four four one two three four five six', 'O244I23456',
  ])('finds the contact detail in %j', (text) => {
    expect(blocksStructurally(text)).toBe(true)
  })

  it.each([
    'The rent is GH₵ 2,500 a month', 'Digital address GA-492-7458', 'Coordinates: 5.6037, -0.1870', 'Ghana card GHA-712345678-3',
    'Invoice INV-2026-5238 was paid', 'the lease runs from 2026 to 2029', 'Router IP is 192.168.1.1', 'I saw your listing on Facebook',
    'https://userentos.com/property/7kq2m9a', 'https://maps.app.goo.gl/AbCdEf123', 'Telegram groups also post rentals but they are full of scams.',
    'meet me @ the gate at 3pm', 'My email is verified on RentOS now.',
  ])('finds nothing to stop in %j', (text) => {
    expect(blocksStructurally(text)).toBe(false)
  })

  it('allows maps, government and RentOS links, and stops messaging links', () => {
    expect(isSafeLink('maps.app.goo.gl')).toBe(true)
    expect(isSafeLink('google.com', '/maps/place/x')).toBe(true)
    expect(isSafeLink('google.com', '/search')).toBe(false)
    expect(isSafeLink('rentcontrol.gov.gh')).toBe(true)
    expect(isSafeLink('kofi.userentos.com')).toBe(true)
    expect(kinds('chat me on wa.me/233244123456')).toContain('domain.messaging')
  })

  it('flags intent phrases as evidence, and policy talk as policy talk', () => {
    expect(kinds('send me your number')).toContain('intent.request_phrase')
    expect(kinds("let's continue on WhatsApp")).toContain('intent.move_off_phrase')
    expect(kinds('pay the deposit straight to me')).toContain('intent.pay_outside_phrase')
    expect(kinds("why can't I send my number here?")).toContain('intent.policy_discussion')
  })

  it('never puts a contact value in the audit mask', () => {
    const masked = maskForAudit('call 0244123456 or kofi@gmail.com, IG @kofi_homes, https://wa.me/233244123456')
    expect(masked).not.toMatch(/\d/)
    expect(masked).not.toContain('kofi@gmail.com')
    expect(masked).not.toContain('@kofi_homes')
    expect(masked).not.toContain('wa.me')
  })
})
