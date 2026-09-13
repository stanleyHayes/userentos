import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key(): Buffer {
  const value = process.env.STORE_BILLING_ENCRYPTION_KEY?.trim() ?? ''
  if (!/^[a-f\d]{64}$/i.test(value)) throw new Error('Store billing encryption key is not configured')
  return Buffer.from(value, 'hex')
}

export function encryptStoreToken(token: string, context: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(context))
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join('.')
}

export function decryptStoreToken(value: string, context: string): string {
  const [version, iv, tag, encrypted, extra] = value.split('.')
  if (version !== 'v1' || extra !== undefined || !/^[a-f\d]{24}$/i.test(iv ?? '') || !/^[a-f\d]{32}$/i.test(tag ?? '') || !/^(?:[a-f\d]{2})+$/i.test(encrypted ?? '')) throw new Error('Invalid encrypted store token')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'))
    decipher.setAAD(Buffer.from(context))
    decipher.setAuthTag(Buffer.from(tag, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8')
  } catch { throw new Error('Store token could not be decrypted') }
}
