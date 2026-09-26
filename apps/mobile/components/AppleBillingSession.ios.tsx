import { loadAppleRestorations } from '../lib/appleRestorations'
import { completeAppleTransaction, type AppleCompletion } from '../lib/applePurchaseCompletion'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import type { Purchase } from 'expo-iap'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useAppleBillingStore, type AppleOffer } from '../stores/appleBillingStore'

import { appleStoreOffers, type AppleStoreMapping } from '../lib/appleStoreOffers'
import { serializeConnection } from '../lib/storeConnection'
import { mapStoreError, restoreSummary } from '../lib/storeErrors'

/** Lives with the signed-in session, so navigating away from checkout does not
 * remove purchase listeners. Apple transaction identifiers are never stored in app storage.
 */
export default function AppleBillingSession() {
  const user = useAuthStore(state => state.user)
  const eligible = !!user && !user.suspendedAt && user.roles.some(role => ['landlord', 'property_manager'].includes(role))
  const userId = user?.id
  useEffect(() => {
    if (!eligible || !userId) { useAppleBillingStore.setState({ ready: false, busy: false, offers: [], message: '', error: '' }); return }
    let disposed = false
    let sdk: typeof import('expo-iap') | undefined
    let binding = ''
    let cleanup: (() => void) | undefined
    const pending = new Set<string>()
    const current = () => !disposed && useAuthStore.getState().user?.id === userId && !useAuthStore.getState().user?.suspendedAt
    const set = (state: Partial<ReturnType<typeof useAppleBillingStore.getState>>) => { if (current()) useAppleBillingStore.setState(state) }
    const fail = (message: string) => set({ error: message, busy: false })
    async function complete(purchase: Purchase) {
      if (!current() || purchase.store !== 'apple' || !purchase.id || pending.has(purchase.id)) return
      if (purchase.purchaseState === 'pending') { set({ message: 'Payment is pending in App Store. Your plan activates after confirmation.', busy: false }); return }
      if (!/^\d{1,32}$/.test(purchase.id)) { fail('The App Store transaction could not be identified. Restore purchases to retry.'); return }
      pending.add(purchase.id)
      try {
        if (!sdk) return
        const result = await completeAppleTransaction(purchase, { current,
          verify: transactionId => api.post<AppleCompletion>('/store-billing/apple/complete', { transactionId }),
          finish: item => sdk!.finishTransaction({ purchase: item, isConsumable: false }),
        })
        if (!result) return
        set({ busy: false, error: '', message: result.entitlementState === 'active' ? 'Your App Store subscription is active.' : 'No active subscription access was confirmed.', revision: useAppleBillingStore.getState().revision + 1 })
      } catch (error) { fail(error instanceof Error ? error.message : 'Could not finish verifying your purchase. Tap Restore purchases to retry; do not purchase again.') }
      finally { pending.delete(purchase.id) }
    }
    /** `explicit`: the user tapped Restore. The silent restore on start and
     * on every foreground reports neither "nothing found" nor its failures. */
    async function restore(explicit = true) {
      if (!sdk || !current()) return
      set({ busy: true, error: '' })
      try {
        if (explicit) await sdk.restorePurchases()
        if (!current()) return
        const purchases = await loadAppleRestorations(sdk)
        for (const purchase of purchases) await complete(purchase)
        const summary = restoreSummary(purchases.length, explicit, 'App Store')
        if (summary) set({ message: summary })
      } catch { if (explicit) fail('Could not restore App Store purchases. Please try again.') }
      finally { set({ busy: false }) }
    }
    async function reload() {
      if (!sdk || !current()) return
      set({ ready: false, busy: true, offers: [], error: '' })
      try {
        await serializeConnection(() => sdk!.initConnection())
        if (!current()) return
        const account = await api.post<{ appAccountToken: string }>('/store-billing/account', {})
        if (!current()) return
        binding = account.appAccountToken
        const catalogue = await api.get<{ items: AppleStoreMapping[] }>('/store-billing/catalog?platform=apple')
        const products = catalogue.items.length ? await sdk.fetchProducts({ skus: [...new Set(catalogue.items.map(item => item.productId))], type: 'subs' }) : []
        const offers = appleStoreOffers(catalogue.items, products ?? [])
        set({ offers, ready: true })
      } catch { fail('Could not load App Store plans. Please try again.') }
      finally { set({ busy: false }) }
    }
    async function buy(offer: AppleOffer) {
      if (!sdk || !binding || !current() || useAppleBillingStore.getState().busy) return
      if (!useAppleBillingStore.getState().offers.some(item => item.key === offer.key)) return
      set({ busy: true, error: '', message: '' })
      try {
        const existing = await loadAppleRestorations(sdk)
        if (!current()) return
        if (existing.some(item => item.store === 'apple' && (item.purchaseState === 'purchased' || item.purchaseState === 'pending'))) {
          await restore()
          set({ message: 'An existing purchase was found. Manage it in App Store before starting another subscription.' })
          return
        }
        await sdk.requestPurchase({ type: 'subs', request: { apple: { sku: offer.productId, appAccountToken: binding, andDangerouslyFinishTransactionAutomatically: false } } })
        // requestPurchase is event-based; the listener owns completion.
      } catch { fail('App Store could not start checkout. Restore purchases if you were charged.') }
    }
    async function start() {
      set({ ready: false, busy: true, offers: [], error: '', message: '', reload, restore, buy })
      try {
        sdk = await import('expo-iap')
        if (!current()) return
        const updated = sdk.purchaseUpdatedListener(purchase => { void complete(purchase) })
        const errors = sdk.purchaseErrorListener(error => {
          const outcome = mapStoreError(error.code, 'App Store')
          if (outcome.kind === 'restore') { set({ busy: false, error: '' }); void restore(); return }
          set({ busy: false, error: outcome.kind === 'error' ? outcome.message : '', ...(outcome.kind === 'pending' ? { message: outcome.message } : {}) })
        })
        cleanup = () => { updated.remove(); errors.remove(); void serializeConnection(() => sdk!.endConnection()).catch(() => {}) }
        await reload()
        await restore(false)
      } catch { fail('App Store billing is unavailable in this app build. Please try again with the store app.') }
    }
    const foreground = AppState.addEventListener('change', state => { if (state === 'active' && sdk && current()) void restore(false) })
    void start()
    return () => { disposed = true; foreground.remove(); cleanup?.(); useAppleBillingStore.setState({ ready: false, busy: false, offers: [], message: '', error: '' }) }
  }, [eligible, userId])
  return null
}
