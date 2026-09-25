import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEGAL_LABELS } from '../services/legal/abuseCheck.js'

// Fines and prison terms are only quoted once verified against the Act; an
// invented one tells a tenant their landlord committed a crime.
const UNVERIFIED_PENALTY = /\d|penalty units|imprison/i

describe('legal outcomes shown to tenants', () => {
  it('describe remedies without unverified fines or prison terms', () => {
    for (const [key, label] of Object.entries(LEGAL_LABELS)) expect(label.maxPenalty, key).not.toMatch(UNVERIFIED_PENALTY)
  })

  it('name the Act correctly and quote no unverified penalties in the rights check', () => {
    const src = readFileSync(join(process.cwd(), 'src/routes/ai.ts'), 'utf8')
    expect(src).not.toContain('Rent Control Act')
    for (const match of src.matchAll(/maxPenalty: '([^']*)'/g)) expect(match[1]).not.toMatch(UNVERIFIED_PENALTY)
  })
})
