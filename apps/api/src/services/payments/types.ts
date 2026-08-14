/**
 * Provider-agnostic payment adapter contract.
 *
 * All payment integrations (MTN MoMo, Telecel Cash, AirtelTigo Money,
 * bank transfer / PSP) implement this interface. Selection happens through
 * `getProvider(method)` in `./index.ts`. The simulator adapter is used by
 * default so dev/seed/test flows keep working without any provider creds.
 */

export type ProviderId =
  | 'mtn_momo'
  | 'telecel_cash'
  | 'airteltigo_money'
  | 'bank_transfer'

export type ProviderStatus = 'pending' | 'completed' | 'failed'

export interface CollectionInput {
  /** Amount in GHS major units (e.g. 250.00). Adapters convert to minor units / strings as needed. */
  amount: number
  /** Payer mobile number in MSISDN format (233XXXXXXXXX). For bank_transfer this is unused. */
  phone: string
  /** Server-side reference (PAY-XXXX-XXXX). Echoed by the provider so we can correlate webhooks. */
  reference: string
  /** Short narration shown on the payer's prompt / statement. */
  narration: string
}

export interface InitiateResult {
  /** Provider-side reference (e.g. MTN's X-Reference-Id, Telecel transaction id, bank PSP token). */
  providerRef: string
  /** Initial state. Most mobile-money rails are async — `pending` is normal. */
  status: ProviderStatus
  /** Optional human-readable next step shown to the payer (e.g. "Approve the prompt"). */
  instructions?: string
}

export interface WebhookEvent {
  /** The server-side reference we sent on initiate (PAY-XXXX-XXXX). */
  reference: string
  /** Provider-side reference. */
  providerRef: string
  /** Final status reported by the provider. */
  status: ProviderStatus
  /** Amount the provider observed (used for sanity-check / fraud detection). */
  amount: number
  /** Provider's event timestamp (ISO). */
  timestamp: string
  /** Raw decoded JSON for audit / debugging. */
  raw: unknown
}

export interface PaymentProvider {
  id: ProviderId
  /**
   * Begin a collection / pull request from the payer's mobile-money wallet
   * (or bank rail). Throws on transport / auth errors. A returned `pending`
   * status is normal and means the user must approve on their device.
   */
  initiateCollection(input: CollectionInput): Promise<InitiateResult>
  /**
   * Verify the authenticity of an inbound webhook. Implementations use HMAC,
   * shared-secret headers, or signature schemes published by the provider.
   * MUST be called against the raw request body before any JSON parsing.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean
  /** Parse the raw body into our normalized `WebhookEvent` shape. */
  parseWebhook(rawBody: string): WebhookEvent
  /** Reconciliation poll — used by the scheduler to catch missed webhooks. */
  queryStatus(providerRef: string): Promise<ProviderStatus>
}
