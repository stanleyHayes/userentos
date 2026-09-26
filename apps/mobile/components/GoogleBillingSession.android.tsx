import { useEffect } from 'react'
import { AppState } from 'react-native'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useGoogleBillingStore, type GoogleOffer } from '../stores/googleBillingStore'
import { createGooglePurchaseCompleter, type GoogleCompletion } from '../lib/googlePurchaseCompletion'
import { serializeConnection } from '../lib/storeConnection'
import { mapStoreError, restoreSummary } from '../lib/storeErrors'

import { googleStoreOffers, type GoogleStoreMapping } from '../lib/googleStoreOffers'

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
    const current = () => !disposed && useAuthStore.getState().user?.id === userId && !useAuthStore.getState().user?.suspendedAt
    const set = (state: Partial<ReturnType<typeof useGoogleBillingStore.getState>>) => { if (current()) useGoogleBillingStore.setState(state) }
    const fail = (message: string) => set({ error: message, busy: false })
    // Every Play token, pending and unknown ones included, goes to the server
    // (lib/googlePurchaseCompletion.ts).
    const complete = createGooglePurchaseCompleter({
      current,
      verify: purchaseToken => api.post<GoogleCompletion>('/store-billing/google/complete', { purchaseToken }),
      update: set,
      revision: () => useGoogleBillingStore.getState().revision,
    })
    /** `explicit`: the user tapped Restore. The silent restore on start and
     * on every foreground reports neither "nothing found" nor its failures. */
    async function restore(explicit = true) {
      if (!sdk || !current()) return
      set({ busy: true, error: '' })
      try {
        const purchases = await sdk.getAvailablePurchases()
        for (const purchase of purchases) await complete(purchase)
        const summary = restoreSummary(purchases.length, explicit, 'Google Play')
        if (summary) set({ message: summary })
      } catch { if (explicit) fail('Could not restore Google Play purchases. Please try again.') }
      finally { set({ busy: false }) }
    }
    async function reload() {
      if (!sdk || !current()) return
      set({ ready: false, busy: true, offers: [], error: '' })
      try {
        await serializeConnection(() => sdk!.initConnection())
        if (!current()) return
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
        const updated = sdk.purchaseUpdatedListener(purchase => { void complete(purchase, true) })
        const errors = sdk.purchaseErrorListener(error => {
          const outcome = mapStoreError(error.code, 'Google Play')
          if (outcome.kind === 'restore') { set({ busy: false, error: '' }); void restore(); return }
          set({ busy: false, error: outcome.kind === 'error' ? outcome.message : '', ...(outcome.kind === 'pending' ? { message: outcome.message } : {}) })
        })
        cleanup = () => { updated.remove(); errors.remove(); void serializeConnection(() => sdk!.endConnection()).catch(() => {}) }
        await reload()
        await restore(false)
      } catch { fail('Google Play billing is unavailable in this app build. Please try again with the store app.') }
    }
    const foreground = AppState.addEventListener('change', state => { if (state === 'active' && sdk && current()) void restore(false) })
    void start()
    return () => { disposed = true; foreground.remove(); cleanup?.(); useGoogleBillingStore.setState({ ready: false, busy: false, offers: [], message: '', error: '' }) }
  }, [eligible, userId])
  return null
}
