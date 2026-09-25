import { InsurancePolicy, type IInsurancePolicy, type IInsuranceClaim } from '../models/InsurancePolicy.js'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { creditWallet, debitWallet } from './payments/walletLedger.js'
import { notify } from './notify.js'
import { round2 } from '../utils/money.js'

export class ClaimDecisionError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Cover still available on a policy: the limit less everything already paid or approved. */
export function remainingCoverage(policy: Pick<IInsurancePolicy, 'claims'>, coverageLimit: number, excludeClaimId?: string): number {
  const used = policy.claims
    .filter((c) => c.id !== excludeClaimId && (c.status === 'approved' || c.status === 'paid'))
    .reduce((sum, c) => sum + (c.payoutAmount ?? 0), 0)
  return round2(Math.max(0, coverageLimit - used))
}

export type ClaimFunding =
  /** The insurer decides on the platform and pays from its own wallet. */
  | { kind: 'provider_wallet'; providerUserId: string }
  /** An admin records the insurer's decision; the payout arrived as an external settlement. */
  | { kind: 'external_settlement'; settlementReference: string }

export interface ClaimDecision {
  policyId: string
  claimId: string
  decision: 'approved' | 'rejected'
  notes?: string
  payoutAmount?: number
  decidedBy: string
  source: 'provider' | 'admin_recorded'
  providerReference?: string
  funding?: ClaimFunding
  /** Provider decisions are limited to the provider's own policies. */
  providerId?: string
}

/**
 * Decide a pending claim. The payout is never defaulted to the amount claimed:
 * it must be stated, must not exceed the claim or the remaining cover, and every
 * wallet credit is matched by the insurer's debit or an external settlement.
 */
export async function decideClaim(d: ClaimDecision): Promise<{ policy: IInsurancePolicy; claim: IInsuranceClaim }> {
  const policy = await InsurancePolicy.findOne({ _id: d.policyId, ...(d.providerId ? { providerId: d.providerId } : {}) })
  if (!policy) throw new ClaimDecisionError('Policy not found', 404)
  const claim = policy.claims.find((c) => c.id === d.claimId)
  if (!claim) throw new ClaimDecisionError('Claim not found', 404)
  if (claim.status !== 'pending') throw new ClaimDecisionError(`Claim is already ${claim.status}`, 409)

  let payout: number | undefined
  if (d.decision === 'approved') {
    if (!d.funding) throw new ClaimDecisionError('A funding source is required to pay an approved claim')
    if (d.payoutAmount === undefined || !(d.payoutAmount > 0)) throw new ClaimDecisionError('State the payout amount for an approved claim')
    payout = round2(d.payoutAmount)
    const product = await InsuranceProduct.findById(policy.productId).select('coverageLimit').lean()
    if (!product) throw new ClaimDecisionError('Product for this policy no longer exists', 409)
    if (payout > claim.amount) throw new ClaimDecisionError('The payout cannot exceed the amount claimed')
    if (payout > remainingCoverage(policy, product.coverageLimit, claim.id)) throw new ClaimDecisionError('The payout exceeds the cover remaining on this policy')
    if (d.funding.kind === 'external_settlement' && await InsurancePolicy.exists({ 'claims.payoutReference': d.funding.settlementReference })) {
      throw new ClaimDecisionError('That settlement reference has already paid a claim', 409)
    }
  }

  const decidedAt = new Date().toISOString()
  const setFields: Record<string, unknown> = {
    'claims.$.status': d.decision,
    'claims.$.notes': d.notes,
    'claims.$.decidedBy': d.decidedBy,
    'claims.$.decidedAt': decidedAt,
    'claims.$.decisionSource': d.source,
  }
  if (d.providerReference) setFields['claims.$.providerReference'] = d.providerReference
  if (payout !== undefined) setFields['claims.$.payoutAmount'] = payout

  // Only one concurrent request can match the still-pending element.
  const decided = await InsurancePolicy.findOneAndUpdate(
    { _id: policy._id, claims: { $elemMatch: { id: d.claimId, status: 'pending' } } },
    { $set: setFields },
    { returnDocument: 'after' },
  )
  if (!decided) throw new ClaimDecisionError('Claim is no longer pending', 409)

  const revert = () => InsurancePolicy.updateOne(
    { _id: policy._id, 'claims.id': d.claimId },
    { $set: { 'claims.$.status': 'pending' }, $unset: { 'claims.$.notes': 1, 'claims.$.decidedBy': 1, 'claims.$.decidedAt': 1, 'claims.$.decisionSource': 1, 'claims.$.providerReference': 1, 'claims.$.payoutAmount': 1 } },
  )

  if (payout !== undefined && d.funding) {
    const reference = d.funding.kind === 'external_settlement' ? d.funding.settlementReference : `CLAIM-${d.claimId}`
    if (d.funding.kind === 'provider_wallet') {
      const funded = await debitWallet(d.funding.providerUserId, payout, { type: 'insurance_claim_payout', reference, description: `Claim ${d.claimId} on ${policy.policyNumber}` })
      if (!funded) { await revert(); throw new ClaimDecisionError('Insufficient insurer wallet balance to pay this claim') }
    }
    try {
      await creditWallet(policy.userId, payout, { type: 'insurance_claim_payout', reference, description: `Insurance claim payout — ${policy.insurerPolicyNumber ?? policy.policyNumber}` })
    } catch (err) {
      if (d.funding.kind === 'provider_wallet') {
        await creditWallet(d.funding.providerUserId, payout, { type: 'refund', reference: `${reference}-REV`, description: 'Reversal of failed claim payout' })
          .catch((refundErr) => console.error(`[insurance] CRITICAL: insurer refund failed for claim ${d.claimId}: ${(refundErr as Error).message}`))
      }
      await revert()
      throw err
    }
    await InsurancePolicy.updateOne(
      { _id: policy._id, 'claims.id': d.claimId },
      { $set: { 'claims.$.status': 'paid', 'claims.$.payoutReference': reference, 'claims.$.paidAt': new Date().toISOString() } },
    )
  }

  // With nothing left pending, a 'claimed' policy returns to active cover.
  const fresh = (await InsurancePolicy.findById(policy._id))!
  if (fresh.status === 'claimed' && !fresh.claims.some((c) => c.status === 'pending')) {
    fresh.status = 'active'
    await fresh.save()
  }
  const result = fresh.claims.find((c) => c.id === d.claimId)!

  void notify({
    userId: fresh.userId,
    title: d.decision === 'approved' ? 'Insurance Claim Paid' : 'Insurance Claim Rejected',
    message: d.decision === 'approved'
      ? `Your insurer approved claim ${d.claimId} and paid GHS ${payout!.toFixed(2)} to your wallet.${d.notes ? ` Notes: ${d.notes}` : ''}`
      : `Your insurer rejected claim ${d.claimId}.${d.notes ? ` Notes: ${d.notes}` : ''}`,
    actionUrl: '/insurance',
  })
  return { policy: fresh, claim: result }
}
