/**
 * Paystack marketplace adapter: subaccounts and split collection (spec §8).
 *
 * Separate from services/payouts/paystack.ts, which pushes money OUT via
 * Transfers. This one pulls money IN and splits it at settlement time.
 *
 * Verified against Paystack's documentation rather than memory:
 *   POST /subaccount            { business_name, settlement_bank, account_number, percentage_charge }
 *                               -> data.subaccount_code (ACCT_xxx)
 *   GET  /bank?country=ghana&currency=GHS
 *   GET  /bank/resolve?account_number=&bank_code=   -> data.account_name
 *   POST /transaction/initialize { email, amount, reference, subaccount, bearer,
 *                                  transaction_charge? } -> authorization_url, access_code
 *   GET  /transaction/verify/:reference
 * Webhooks carry `x-paystack-signature`: hex HMAC-SHA512 of the RAW body keyed
 * with the secret key.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { envOr } from '../../utils/env.js'
import { toMinorUnits } from './split.js'

const BASE_URL = envOr('PAYSTACK_BASE_URL', 'https://api.paystack.co')
const REQUEST_TIMEOUT_MS = 20_000

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set — marketplace payments cannot run')
  return key
}

interface Envelope<T> { status: boolean; message: string; data: T }

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${secretKey()}`, 'content-type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await res.text()
  let payload: Envelope<T>
  try {
    payload = JSON.parse(text) as Envelope<T>
  } catch {
    throw new Error(`Paystack ${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok || payload.status === false) {
    throw new Error(`Paystack ${path} failed (${res.status}): ${payload.message || text.slice(0, 200)}`)
  }
  return payload.data
}

export interface BankOption { name: string; code: string; currency: string }

export async function listBanks(country = 'ghana', currency = 'GHS'): Promise<BankOption[]> {
  const banks = await call<{ name: string; code: string; currency: string }[]>(
    `/bank?country=${encodeURIComponent(country)}&currency=${encodeURIComponent(currency)}`,
  )
  return banks.map((b) => ({ name: b.name, code: b.code, currency: b.currency }))
}

/** Confirm the account exists and return the name the bank has on file. */
export async function resolveAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string }> {
  const data = await call<{ account_name: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  )
  return { accountName: data.account_name }
}

export interface CreateSubaccountInput {
  businessName: string
  settlementBank: string
  accountNumber: string
  /** Percentage RETAINED BY THE PLATFORM — Paystack's percentage_charge. */
  platformFeePercent: number
  contactEmail?: string
  contactName?: string
}

export async function createSubaccount(input: CreateSubaccountInput): Promise<{ subaccountCode: string; accountName?: string }> {
  const data = await call<{ subaccount_code: string; account_name?: string }>('/subaccount', {
    method: 'POST',
    body: {
      business_name: input.businessName,
      settlement_bank: input.settlementBank,
      account_number: input.accountNumber,
      // percentage_charge is the MAIN account's cut, i.e. the RentOS fee.
      percentage_charge: input.platformFeePercent,
      primary_contact_email: input.contactEmail,
      primary_contact_name: input.contactName,
    },
  })
  if (!data.subaccount_code) throw new Error('Paystack did not return a subaccount code')
  return { subaccountCode: data.subaccount_code, accountName: data.account_name }
}

export async function updateSubaccount(code: string, input: Partial<CreateSubaccountInput>): Promise<void> {
  await call(`/subaccount/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: {
      business_name: input.businessName,
      settlement_bank: input.settlementBank,
      account_number: input.accountNumber,
      percentage_charge: input.platformFeePercent,
    },
  })
}

export interface InitializeSplitInput {
  email: string
  /** Amount the buyer pays, in GHS major units. */
  amount: number
  reference: string
  subaccountCode: string
  /** Who pays Paystack's own processing fee. Recorded, never assumed. */
  feeBearer: 'platform' | 'seller'
  /** Flat platform fee in GHS, overriding the subaccount percentage. */
  flatPlatformFee?: number
  callbackUrl?: string
  metadata?: Record<string, unknown>
}

export async function initializeSplitTransaction(input: InitializeSplitInput): Promise<{
  authorizationUrl: string
  accessCode: string
  reference: string
}> {
  const body: Record<string, unknown> = {
    email: input.email,
    amount: toMinorUnits(input.amount),
    reference: input.reference,
    subaccount: input.subaccountCode,
    currency: 'GHS',
    metadata: input.metadata,
  }
  // Default is the main account; only send the override when the seller bears it.
  if (input.feeBearer === 'seller') body.bearer = 'subaccount'
  if (typeof input.flatPlatformFee === 'number') body.transaction_charge = toMinorUnits(input.flatPlatformFee)
  if (input.callbackUrl) body.callback_url = input.callbackUrl

  const data = await call<{ authorization_url: string; access_code: string; reference: string }>(
    '/transaction/initialize',
    { method: 'POST', body },
  )
  return { authorizationUrl: data.authorization_url, accessCode: data.access_code, reference: data.reference }
}

export interface VerifiedTransaction {
  status: string
  reference: string
  amount: number
  currency: string
  paidAt?: string
  /** Paystack's own processing fee, in major units. */
  fees?: number
  raw: unknown
}

/**
 * Server-side verification. The spec forbids trusting a browser redirect, so
 * this is the only thing that may mark a transaction paid.
 */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const data = await call<{
    status: string; reference: string; amount: number; currency: string; paid_at?: string; fees?: number
  }>(`/transaction/verify/${encodeURIComponent(reference)}`)

  return {
    status: data.status,
    reference: data.reference,
    amount: data.amount / 100,
    currency: data.currency,
    paidAt: data.paid_at,
    fees: typeof data.fees === 'number' ? data.fees / 100 : undefined,
    raw: data,
  }
}

/** Hex HMAC-SHA512 of the raw body, keyed with the secret key. */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false
  let expected: string
  try {
    expected = createHmac('sha512', secretKey()).update(rawBody, 'utf8').digest('hex')
  } catch {
    return false
  }
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
