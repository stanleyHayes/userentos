import fetch, { Response, type RequestInit } from 'node-fetch'
import { AppStoreServerAPIClient, Environment } from '@apple/app-store-server-library'

/** Buffer the bounded response before returning it to Apple's validator: a
 * deadline that ends at headers would leave response.json() able to hang.
 */
export async function fetchAppleResponse(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error', size: 1_000_000 })
    const body = await response.buffer()
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  } finally { clearTimeout(timer) }
}

export class BoundedAppleClient extends AppStoreServerAPIClient {
  private readonly endpoint: string
  constructor(key: string, keyId: string, issuerId: string, bundleId: string, environment: Environment) {
    super(key, keyId, issuerId, bundleId, environment)
    if (![Environment.PRODUCTION, Environment.SANDBOX].includes(environment)) throw new Error('Unsupported Apple environment')
    this.endpoint = environment === Environment.PRODUCTION ? 'https://api.storekit.itunes.apple.com' : 'https://api.storekit-sandbox.itunes.apple.com'
  }
  protected override makeFetchRequest(path: string, query: URLSearchParams, method: string, body: string | Buffer | undefined, headers: Record<string, string>): Promise<Response> {
    return fetchAppleResponse(`${this.endpoint}${path}?${query}`, { method, body, headers })
  }
}

/** The verifier does not expose cancellation. Bound the caller and discard late
 * results; its own OCSP transport still terminates using the SDK's timeouts.
 */
export async function appleVerificationDeadline<T>(operation: Promise<T>, timeoutMs = 35_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AppleVerificationTimeout()), timeoutMs) })])
  } finally { if (timer) clearTimeout(timer) }
}
export class AppleVerificationTimeout extends Error {}
