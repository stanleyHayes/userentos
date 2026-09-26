import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { beforeAll, describe, expect, it } from 'vitest'
import { RETENTION_SCHEDULE, RETENTION_DAYS } from '../config/retentionSchedule.js'
import { EXPORT_SOURCES, EXPORT_EXCLUSIONS } from '../services/accountExport.js'
import { PURGE_HANDLERS } from '../services/retentionPurge.js'
import { erasureLedgerModel } from '../models/ErasureLedger.js'
import { RETENTION_PERIOD_DAYS } from '../types/index.js'

/*
 * Drift guard for the retention schedule and the subject-access export.
 * Adding a model without classifying it — how long it is kept, and whether
 * it is exported or excluded (with a reason) — fails the build. That is
 * intended: a new collection must not be kept forever, or left out of a
 * person's data export, by accident.
 */
const DAY = 24 * 60 * 60

beforeAll(async () => {
  const dir = new URL('../models/', import.meta.url)
  for (const file of readdirSync(fileURLToPath(dir))) {
    if (file.endsWith('.ts') && file !== 'seed.ts') await import(new URL(file, dir).href)
  }
  await import('../services/cronLock.js')
  erasureLedgerModel()
})

type IndexSpec = [Record<string, unknown>, { expireAfterSeconds?: number } | undefined]
const modelNames = () => mongoose.modelNames().sort()
const indexesOf = (name: string) => mongoose.model(name).schema.indexes() as IndexSpec[]
const rulesFor = (name: string) => RETENTION_SCHEDULE.filter((rule) => rule.models.includes(name))

describe('every collection has a retention rule', () => {
  it('classifies every registered model', () => {
    expect(modelNames().length).toBeGreaterThan(80)
    const unclassified = modelNames().filter((name) => rulesFor(name).length === 0)
    expect(unclassified).toEqual([])
  })

  it('names only models that exist', () => {
    const known = new Set(modelNames())
    expect(RETENTION_SCHEDULE.flatMap((rule) => rule.models).filter((name) => !known.has(name))).toEqual([])
  })

  it('has unique rule ids', () => {
    const ids = RETENTION_SCHEDULE.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps legally pending classes, without purging or pretending to a period', () => {
    for (const rule of RETENTION_SCHEDULE.filter((candidate) => candidate.decision === 'owner_legal_pending')) {
      expect(rule, rule.id).toMatchObject({ periodDays: null, action: 'retain', enforcedBy: 'none' })
    }
  })

  it('gives every enforced rule a period, and every non-personal rule no enforcement', () => {
    for (const rule of RETENTION_SCHEDULE) {
      if (['ttl', 'purge', 'accountErasure'].includes(rule.enforcedBy)) expect(rule.periodDays, rule.id).not.toBeNull()
      if (!rule.personalData && rule.decision === 'not_personal') expect(rule.enforcedBy, rule.id).toBe('none')
    }
  })

  it('matches every TTL index to a ttl rule with the same field and period, and back', () => {
    for (const name of modelNames()) {
      const ttlIndexes = indexesOf(name).filter(([, options]) => options?.expireAfterSeconds !== undefined)
      for (const [keys, options] of ttlIndexes) {
        const field = Object.keys(keys)[0]
        const rule = rulesFor(name).find((candidate) => candidate.enforcedBy === 'ttl' && candidate.ttlField === field)
        expect(rule, `${name}.${field} TTL has no ttl rule`).toBeDefined()
        expect(rule!.periodDays! * DAY, `${name}.${field}`).toBe(options!.expireAfterSeconds)
      }
    }
    for (const rule of RETENTION_SCHEDULE.filter((candidate) => candidate.enforcedBy === 'ttl')) {
      for (const name of rule.models) {
        const indexed = indexesOf(name)
          .some(([keys, options]) => Object.keys(keys)[0] === rule.ttlField && options?.expireAfterSeconds !== undefined)
        expect(indexed, `${rule.id}: ${name} has no TTL index on ${rule.ttlField}`).toBe(true)
      }
    }
  })

  it('has a purge handler for every purge rule, and no handler without a rule', () => {
    const purgeIds = RETENTION_SCHEDULE.filter((rule) => rule.enforcedBy === 'purge').map((rule) => rule.id).sort()
    expect(Object.keys(PURGE_HANDLERS).sort()).toEqual(purgeIds)
  })

  it('enforces exactly the periods the privacy notice publishes', () => {
    for (const [key, days] of Object.entries(RETENTION_PERIOD_DAYS)) {
      expect(RETENTION_DAYS[key as keyof typeof RETENTION_DAYS], key).toBe(days)
    }
  })
})

describe('every collection is in the data export or excluded with a reason', () => {
  const exported = () => new Set(EXPORT_SOURCES.map((source) => source.model.modelName))

  it('covers every registered model', () => {
    const excluded = new Set(Object.keys(EXPORT_EXCLUSIONS))
    expect(modelNames().filter((name) => !exported().has(name) && !excluded.has(name))).toEqual([])
  })

  it('never both exports and excludes a model, and excludes only real models', () => {
    const known = new Set(modelNames())
    for (const [name, reason] of Object.entries(EXPORT_EXCLUSIONS)) {
      expect(exported().has(name), name).toBe(false)
      expect(known.has(name), name).toBe(true)
      expect(reason.length, name).toBeGreaterThan(10)
    }
  })

  it('exports every model a personal-data rule governs unless it is excluded', () => {
    const personal = new Set(RETENTION_SCHEDULE.filter((rule) => rule.personalData).flatMap((rule) => rule.models))
    for (const name of personal) {
      expect(exported().has(name) || name in EXPORT_EXCLUSIONS, name).toBe(true)
    }
  })

  it('uses unique export keys', () => {
    const keys = EXPORT_SOURCES.map((source) => source.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('never selects secrets, token hashes or embeddings', () => {
    const SECRET_PATHS = ['passwordHash', 'mfaSecret', 'secret', 'tokenHash', 'token', 'embedding', 'providerAccessCode', 'recoveryLeaseId']
    for (const source of EXPORT_SOURCES) {
      const paths = Object.keys(source.model.schema.paths)
      const select = (source.select ?? '').split(/\s+/).filter(Boolean)
      const allowlist = select.length > 0 && select.every((field) => !field.startsWith('-') && !field.startsWith('+'))
      for (const secret of SECRET_PATHS.filter((path) => paths.includes(path))) {
        const safe = allowlist ? !select.includes(secret) : select.includes(`-${secret}`)
        expect(safe, `${source.key} exports ${secret}`).toBe(true)
      }
    }
  })
})
