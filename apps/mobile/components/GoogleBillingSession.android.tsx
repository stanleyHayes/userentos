import { useEffect } from 'react'
import { AppState } from 'react-native'
import type { Purchase } from 'expo-iap'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useGoogleBillingStore, type GoogleOffer } from '../stores/googleBillingStore'

import { googleStoreOffers, type GoogleStoreMapping } from '../lib/googleStoreOffers'
type Completion = { purchaseState: string; entitlementState: string; acknowledged: boolean }

/** Lives with the signed-in session, so navigating away from checkout does not
 * remove purchase listeners. Google receipts are never stored in app storage.
 */
export default function GoogleBillingSession() {
  const user = useAuthStore(state => state.user)
  const eligible = !!user && !user.suspendedAt && user.roles.some(role => ['landlord', 'property_manager'].includes(role))
  const userId = user?.id
  useEffect(() => {
    if (!eligible || !userId) { useGoogleBillingStore.setState({ ready: false, busy: false, offers: [], message: '', error: '' }); return }
    let disposed = false
    let sdk: typeof import('expo-iap') | undefined
    let binding = ''
    let cleanup: (() => void) | undefined
    const pending = new Set<string>()
    const current = () => !disposed && useAuthStore.getState().user?.id === userId && !useAuthStore.getState().user?.suspendedAt
    const set = (state: Partial<ReturnType<typeof useGoogleBillingStore.getState>>) => { if (current()) useGoogleBillingStore.setState(state) }
    const fail = (message: string) => set({ error: message, busy: false })
    async function complete(purchase: Purchase) {
      if (!current() || purchase.store !== 'google' || !purchase.purchaseToken || pending.has(purchase.purchaseToken)) return
      if (purchase.purchaseState === 'pending') { set({ message: 'Payment is pending in Google Play. Your plan activates after confirmation.', busy: false }); return }
      pending.add(purchase.purchaseToken)
      try {
        const result = await api.post<Completion>('/store-billing/google/complete', { purchaseToken: purchase.purchaseToken })
        if (!current()) return
        // Google acknowledgement is performed on the server after activation.
        // Do not consume a subscription or acknowledge it before verification.
        set({ busy: false, error: '', message: result.purchaseState === 'SUBSCRIPTION_STATE_PENDING' ? 'Payment is pending in Google Play.' : result.entitlementState === 'active' && result.acknowledged ? 'Your Google Play subscription is active.' : 'No active subscription access was confirmed.', revision: useGoogleBillingStore.getState().revision + 1 })
      } catch (error) { fail(error instanceof Error ? error.message : 'Could not finish verifying your purchase. Tap Restore purchases to retry; do not purchase again.') }
      finally { pending.delete(purchase.purchaseToken) }
    }
    async function restore() {
      if (!sdk || !current()) return
      set({ busy: true, error: '' })
      try {
        const purchases = await sdk.getAvailablePurchases()
        for (const purchase of purchases) await complete(purchase)
        if (!purchases.length) set({ message: 'No Google Play purchases were found for this store account.' })
      } catch { fail('Could not restore Google Play purchases. Please try again.') }
      finally { set({ busy: false }) }
    }
    async function reload() {
      if (!sdk || !current()) return
      set({ ready: false, busy: true, offers: [], error: '' })
      try {
        await sdk.initConnection()
        const account = await api.post<{ obfuscatedAccountId: string }>('/store-billing/account', {})
        if (!current()) return
        binding = account.obfuscatedAccountId
        const catalogue = await api.get<{ items: GoogleStoreMapping[] }>('/store-billing/catalog?platform=google')
        const products = catalogue.items.length ? await sdk.fetchProducts({ skus: [...new Set(catalogue.items.map(item => item.productId))], type: 'subs' }) : []
        const offers = googleStoreOffers(catalogue.items, products ?? [])
        set({ offers, ready: true })
      } catch { fail('Could not load Google Play plans. Please try again.') }
      finally { set({ busy: false }) }
    }
    async function buy(offer: GoogleOffer) {
      if (!sdk || !binding || !current() || useGoogleBillingStore.getState().busy) return
      if (!useGoogleBillingStore.getState().offers.some(item => item.key === offer.key)) return
      set({ busy: true, error: '', message: '' })
      try {
        const existing = await sdk.getAvailablePurchases()
        if (!current()) return
        if (existing.some(item => item.store === 'google' && (item.purchaseState === 'purchased' || item.purchaseState === 'pending'))) {
          await restore()
          set({ message: 'An existing purchase was found. Manage it in Google Play before starting another subscription.' })
          return
        }
        await sdk.requestPurchase({ type: 'subs', request: { google: { skus: [offer.productId], obfuscatedAccountId: binding, subscriptionOffers: [{ sku: offer.productId, offerToken: offer.offerToken }] } } })
        // requestPurchase is event-based; the listener owns completion.
      } catch { fail('Google Play could not start checkout. Restore purchases if you were charged.') }
    }
    async function start() {
      set({ ready: false, busy: true, offers: [], error: '', message: '', reload, restore, buy })
      try {
        sdk = await import('expo-iap')
        if (!current()) return
        const updated = sdk.purchaseUpdatedListener(purchase => { void complete(purchase) })
        const errors = sdk.purchaseErrorListener(error => { set({ busy: false, error: error.code === 'user-cancelled' ? '' : 'Google Play could not complete checkout. Restore purchases if needed.' }) })
        cleanup = () => { updated.remove(); errors.remove(); void sdk?.endConnection() }
        await reload()
        await restore()
      } catch { fail('Google Play billing is unavailable in this app build. Please try again with the store app.') }
    }
    const foreground = AppState.addEventListener('change', state => { if (state === 'active' && sdk && current()) void restore() })
    void start()
    return () => { disposed = true; foreground.remove(); cleanup?.(); useGoogleBillingStore.setState({ ready: false, busy: false, offers: [], message: '', error: '' }) }
  }, [eligible, userId])
  return null
}
