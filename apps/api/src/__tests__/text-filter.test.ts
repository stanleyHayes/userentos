import { describe, it, expect } from 'vitest'
import { screenText, normalizeText } from '../services/moderation/textFilter.js'
import { shouldReport } from '../services/moderation/autoReport.js'

const action = (...text: string[]) => screenText(...text).action

describe('objectionable-content filter', () => {
  it.each([
    'Lovely two-bedroom in East Legon, water flows every day.',
    'The kitchen smelled of spices and the landlord was from Scunthorpe.',
    'Pros and cons: the cons are the noise and the parking.',
    'The traffic on Spintex will kill you, but the flat is worth it.',
    'I think the agent fees will kill you if you are not careful.',
    'You are dead right about the deposit.',
    'Ɛyɛ fɛ paa, me da wo ase.',
    'I paid GHS 1,500 on 01/03 — receipt RNT-2026-0001.',
    '',
  ])('allows ordinary text: %s', (text) => {
    expect(action(text)).toBe('allow')
  })

  it.each([
    'nigger', 'N1gger', 'n i g g e r', 'niiiiigger', 'f.a.g.g.o.t', 'you FAGGOTS',
  ])('rejects a slur, including evasive spellings: %s', (text) => {
    expect(screenText(text)).toMatchObject({ action: 'reject', categories: expect.arrayContaining(['slur']) })
  })

  it.each([
    'I will kill you', "I'll kill you tonight", "i'm going to stab you", 'I will find you and kill you',
    'we will burn your house', 'Kill yourself', 'kys', "you're dead meat", 'Me bɛkum wo',
  ])('rejects a threat of violence: %s', (text) => {
    expect(screenText(text)).toMatchObject({ action: 'reject', categories: ['threat'] })
  })

  it.each([
    'you stupid bitch', 'Fuck you', 'f*ck off'.replace('*', 'u'), 'wo maame twe', 'woye kwasia', 'You are such a useless bastard',
  ])('rejects abuse aimed at the reader: %s', (text) => {
    expect(screenText(text)).toMatchObject({ action: 'reject', categories: ['harassment'] })
  })

  it('rejects sexual content involving children', () => {
    expect(screenText('selling child porn')).toMatchObject({ action: 'reject', categories: ['sexual'] })
  })

  it.each([
    ['this place is shit', 'profanity'],
    ['the landlord is a kwasia', 'harassment'],
    ['he offered sex for rent', 'sexual'],
    ['a chink of light through the curtain', 'slur'],
    ['the flat was spic and span', 'slur'],
    ['I want to report a rape near the gate', 'sexual'],
  ])('flags, but keeps, borderline text: %s', (text, category) => {
    expect(screenText(text)).toMatchObject({ action: 'flag', categories: [category] })
  })

  it('rejects when anything rejectable appears, whatever else is flagged', () => {
    expect(action('this shit hole', 'I will kill you')).toBe('reject')
  })

  it('screens every part written together', () => {
    expect(action('Nice place', 'Great host', 'fuck you')).toBe('reject')
  })

  it('rejoins letters spaced apart and keeps trailing punctuation out of words', () => {
    expect(normalizeText('f u c k you!')).toEqual(['fuck', 'you'])
    expect(normalizeText('sh!t, really.')).toEqual(['shit', 'really'])
  })
})

describe('which flags reach a moderator', () => {
  it('leaves profanity in a private conversation alone but reports it in public', () => {
    const verdict = screenText('this is shit')
    expect(shouldReport(verdict, 'private')).toBe(false)
    expect(shouldReport(verdict, 'public')).toBe(true)
  })

  it('reports sexual or abusive flags wherever they appear', () => {
    expect(shouldReport(screenText('sleep with me and I will reduce the rent'), 'private')).toBe(true)
  })

  it('never reports allowed text', () => {
    expect(shouldReport(screenText('hello'), 'public')).toBe(false)
  })
})
