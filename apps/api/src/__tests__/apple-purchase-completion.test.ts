import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeApplePurchase } from '../services/storeBilling/completeApplePurchase.js'
const mocks = vi.hoisted(() => ({ record: vi.fn(), prepare: vi.fn(), activate: vi.fn() }))
vi.mock('../services/storeBilling/applePurchaseJournal.js', () => ({ recordApplePurchase: mocks.record }))
vi.mock('../services/storeBilling/appleEntitlements.js', () => ({ prepareAppleEntitlements: mocks.prepare, activateAppleEntitlements: mocks.activate }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.record.mockResolvedValue({ _id: 'journal', revision: 1 })
  mocks.prepare.mockResolvedValue({})
  mocks.activate.mockResolvedValue({ providerStatus: 1, entitlementState: 'active', originalTransactionCiphertext: 'private' })
})
describe('Apple completion retry sequence', () => {
  it('returns only processing state after ordered verification, preparation and activation', async () => {
    expect(await completeApplePurchase('owner', '123456')).toEqual({ purchaseId: 'journal', revision: 1, purchaseState: 1, entitlementState: 'active' })
    expect(mocks.record).toHaveBeenCalledWith('owner', '123456')
    expect(mocks.prepare).toHaveBeenCalledWith('owner', 'journal', 1)
    expect(mocks.activate).toHaveBeenCalledWith('owner', 'journal', 1)
    const order = [mocks.record, mocks.prepare, mocks.activate].map(fn => fn.mock.invocationCallOrder[0])
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
  it.each(['record', 'prepare', 'activate'] as const)('re-verifies after interruption in %s', async stage => {
    mocks[stage].mockRejectedValueOnce(new Error('interrupted'))
    await expect(completeApplePurchase('owner', '123456')).rejects.toThrow('interrupted')
    if (stage !== 'activate') expect(mocks.activate).not.toHaveBeenCalled()
    mocks.record.mockResolvedValue({ _id: 'journal', revision: 2 })
    expect(await completeApplePurchase('owner', '123456')).toMatchObject({ revision: 2, entitlementState: 'active' })
    expect(mocks.record).toHaveBeenCalledTimes(2)
    expect(mocks.activate).toHaveBeenLastCalledWith('owner', 'journal', 2)
  })
  it('returns verified revocation without pretending it grants access', async () => {
    mocks.activate.mockResolvedValue({ providerStatus: 5, entitlementState: 'revoked' })
    expect(await completeApplePurchase('owner', '123456')).toMatchObject({ purchaseState: 5, entitlementState: 'revoked' })
  })
})
