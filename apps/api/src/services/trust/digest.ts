/**
 * A keyed digest of a message, so a reviewer's "stopped by mistake" can let
 * the same text through next time without storing the text. A plain hash of
 * a phone number can be reversed by trying every number; an HMAC under a
 * server-side key cannot.
 */
import { createHmac } from 'node:crypto'

let key: Buffer | null = null

function digestKey(): Buffer {
  if (!key) {
    const secret = process.env.TRUST2_DIGEST_KEY || process.env.JWT_SECRET
    if (!secret && process.env.NODE_ENV === 'production') throw new Error('TRUST2_DIGEST_KEY or JWT_SECRET is required')
    key = createHmac('sha256', secret || 'trust2-development-key').update('trust2-text-digest-v1').digest()
  }
  return key
}

export function textDigest(text: string): string {
  const canonical = text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
  return createHmac('sha256', digestKey()).update(canonical).digest('base64url')
}
