import crypto from 'crypto'

/**
 * Minimal RFC 6238 TOTP implementation (HMAC-SHA1, 6 digits, 30s step).
 * Dependency-free so no extra packages are needed for MFA.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Generate a random base32-encoded secret (160 bits). */
export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20)
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/[\s=-]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const output: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

function hotp(key: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(code % 10 ** digits).padStart(digits, '0')
}

/** Verify a TOTP code against a base32 secret. Allows ±1 time-step drift. */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const key = base32Decode(secret)
  const step = Math.floor(Date.now() / 1000 / 30)
  for (let i = -window; i <= window; i++) {
    // timingSafeEqual to avoid leaking via early-exit comparison
    const expected = hotp(key, step + i)
    const a = Buffer.from(expected)
    const b = Buffer.from(clean)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return false
}

/** Build an otpauth:// URL for authenticator apps (Google Authenticator, etc.). */
export function buildOtpauthUrl(secret: string, email: string, issuer = 'RentOS Ghana'): string {
  const label = `${issuer}:${email}`
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
