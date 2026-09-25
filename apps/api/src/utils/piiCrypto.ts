import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { logger } from './logger.js'

/**
 * Field-level AES-256-GCM for special personal data (Ghana Card / national ID
 * numbers — Data Protection Act 2012, Act 843). Values are stored as
 * `pii:v1.<iv>.<tag>.<ciphertext>` (hex) with the field name as AAD, so a
 * ciphertext copied into another field or collection will not decrypt.
 *
 * Rows written before encryption hold plaintext; decryptPii passes those
 * through unchanged, and they are re-encrypted on their next write (or by
 * scripts/encryptPiiFields.ts).
 */
const PREFIX = 'pii:v1.'
let cachedKey: Buffer | undefined

function key(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.PII_ENCRYPTION_KEY?.trim() ?? ''
  if (raw) {
    if (!/^[a-f\d]{64}$/i.test(raw)) throw new Error('PII_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    cachedKey = Buffer.from(raw, 'hex')
  } else if (process.env.NODE_ENV === 'production') {
    // Fail closed: never write special personal data under a guessable key.
    throw new Error('PII_ENCRYPTION_KEY is required in production')
  } else {
    logger.warn('[pii] PII_ENCRYPTION_KEY not set — using the development-only key')
    cachedKey = createHash('sha256').update('rentos-development-only-pii-key').digest()
  }
  return cachedKey
}

export function isEncryptedPii(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function encryptPii(value: string, field: string): string {
  if (isEncryptedPii(value)) return value
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(field))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${PREFIX}${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`
}

/** Returns plaintext; legacy plaintext passes through; undecryptable → undefined. */
export function decryptPii(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (!isEncryptedPii(value)) return String(value)
  const [iv, tag, encrypted, extra] = value.slice(PREFIX.length).split('.')
  if (extra !== undefined || !/^[a-f\d]{24}$/i.test(iv ?? '') || !/^[a-f\d]{32}$/i.test(tag ?? '') || !/^(?:[a-f\d]{2})*$/i.test(encrypted ?? '')) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'))
    decipher.setAAD(Buffer.from(field))
    decipher.setAuthTag(Buffer.from(tag, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    logger.warn(`[pii] could not decrypt ${field}`)
    return undefined
  }
}

/** Mongoose setter: encrypt on every write path (doc set, create, $set casts). */
export function piiSetter(field: string) {
  return (value: unknown) => (value === undefined || value === null || value === '' ? undefined : encryptPii(String(value), field))
}

/** Last four ID characters (separators dropped) — all a counterparty ever needs. */
export function piiLast4(value: unknown, field: string): string | undefined {
  const plain = decryptPii(value, field)?.replace(/[^A-Za-z0-9]/g, '')
  return plain ? plain.slice(-4) : undefined
}

export const PII_FIELDS = {
  userGhanaCard: 'User.ghanaCardId',
  tenantIdNumber: 'TenantProfile.idNumber',
} as const
