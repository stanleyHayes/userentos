import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { visitorHash, warnIfVisitorHashSecretUnset } from '../utils/visitorHash.js'
import { StorefrontEvent } from '../models/StorefrontEvent.js'
import { logger } from '../utils/logger.js'

const monday = new Date('2026-09-28T08:00:00Z')
const mondayNight = new Date('2026-09-28T23:59:00Z')
const tuesday = new Date('2026-09-29T00:01:00Z')

describe('visitor hashes on public pages', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is stable for one visitor within a day, so daily uniques still count', () => {
    vi.stubEnv('VISITOR_HASH_SECRET', 'test-secret')
    expect(visitorHash('ip:41.66.1.2', monday)).toBe(visitorHash('ip:41.66.1.2', mondayNight))
    expect(visitorHash('ip:41.66.1.2', monday)).not.toBe(visitorHash('ip:41.66.1.3', monday))
  })

  it('changes every day, so nothing stored links one visitor across days', () => {
    vi.stubEnv('VISITOR_HASH_SECRET', 'test-secret')
    expect(visitorHash('ip:41.66.1.2', monday)).not.toBe(visitorHash('ip:41.66.1.2', tuesday))
  })

  it('cannot be recomputed without the server secret', () => {
    vi.stubEnv('VISITOR_HASH_SECRET', 'test-secret')
    const keyed = visitorHash('ip:41.66.1.2', monday)
    // The old digest: anyone could rebuild it by hashing every IPv4 address.
    expect(keyed).not.toBe(createHash('sha256').update('41.66.1.2').digest('hex'))
    expect(keyed).not.toBe(createHash('sha256').update('ip:41.66.1.2').digest('hex'))
    vi.stubEnv('VISITOR_HASH_SECRET', 'another-secret')
    expect(visitorHash('ip:41.66.1.2', monday)).not.toBe(keyed)
  })

  it('warns at a production boot that has no secret, and only then', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    try {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VISITOR_HASH_SECRET', '')
      warnIfVisitorHashSecretUnset()
      expect(warn).toHaveBeenCalledTimes(1)

      vi.stubEnv('VISITOR_HASH_SECRET', 'set')
      warnIfVisitorHashSecretUnset()
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('VISITOR_HASH_SECRET', '')
      warnIfVisitorHashSecretUnset()
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('storefront traffic keeps only the digest, never the raw session id', () => {
    expect(Object.keys(StorefrontEvent.schema.paths)).not.toContain('sessionId')
    const event = new StorefrontEvent({ storefrontSlug: 'shop', type: 'view', visitorHash: 'h', sessionId: 'raw-session-id' } as never)
    expect(event.toObject()).not.toHaveProperty('sessionId')
  })
})
