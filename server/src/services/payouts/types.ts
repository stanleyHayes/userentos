/**
 * Provider-agnostic payout (money-out) contract.
 *
 * Deliberately separate from `services/payments/types.ts`: that interface pulls
 * money IN from a payer, this one pushes it OUT to a recipient. A PSP that does
 * both implements both; swapping payout providers means adding one file here
 * and changing PAYOUT_PROVIDER, with no route or model changes.
 */

export type PayoutProviderId = 'paystack' | 'simulated'

export type PayoutStatusValue = 'pending' | 'paid' | 'failed'

/** A destination as the PSP knows it — mobile money wallet or bank account. */
export interface RecipientInput {
  /** 'mobile_money' for a MoMo wallet, 'ghipss' for a Ghanaian bank account. */
  type: 'mobile_money' | 'ghipss'
  /** Account holder name as the user typed it. The PSP may correct it. */
  name: string
  /** MoMo phone number (0XXXXXXXXX) or bank account number. */
  accountNumber: string
  /** Telco or bank code from `listDestinations()`. */
  bankCode: string
}

export interface RecipientResult {
  /** PSP handle for this destination (Paystack RCP_xxx). */
  recipientCode: string
  /** Name the PSP resolved — shown back to the user before any payout runs. */
  accountName: string
}

export interface TransferInput {
  /** Amount in GHS major units. Adapters convert to minor units. */
  amount: number
  recipientCode: string
  /** Our reference (PO-XXXX), echoed back on the webhook. */
  reference: string
  /** Short narration shown on the recipient's statement. */
  reason: string
}

export interface TransferResult {
  /** PSP transfer handle (Paystack TRF_xxx). */
  providerRef: string
  /** `pending` is the normal case — delivery is confirmed by webhook. */
  status: PayoutStatusValue
}

export interface PayoutWebhookEvent {
  /** Our reference, as sent on the transfer. */
  reference: string
  providerRef: string
  status: PayoutStatusValue
  /** Amount the PSP reported, for sanity-checking against our record. */
  amount: number
  /** Provider event timestamp (ISO). */
  timestamp: string
  /** Reason text when the transfer failed or reversed. */
  failureReason?: string
  raw: unknown
}

/** One telco or bank a user can be paid into. */
export interface PayoutDestination {
  name: string
  code: string
  type: 'mobile_money' | 'ghipss'
}

export interface PayoutProvider {
  id: PayoutProviderId

  /** Telcos and banks available for payouts, for the account-setup form. */
  listDestinations(): Promise<PayoutDestination[]>

  /**
   * Register a destination and resolve the account holder's real name.
   * Throws when the PSP cannot resolve the account — which is exactly what
   * should happen, since an unresolvable account is an unpayable one.
   */
  createRecipient(input: RecipientInput): Promise<RecipientResult>

  /** Push money out. A `pending` result is normal; the webhook confirms. */
  sendTransfer(input: TransferInput): Promise<TransferResult>

  /** Verify a webhook against the raw request bytes. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean

  /** Parse a verified webhook body. Throws if it is not a transfer event. */
  parseWebhook(rawBody: string): PayoutWebhookEvent
}
