import { create } from 'zustand'
export interface AppleOffer {
  key: string; productId: string; name: string; maxProperties: number; benefits: string[]; terms: string
}
interface BillingState {
  ready: boolean; busy: boolean; offers: AppleOffer[]; message: string; error: string; revision: number
  reload: () => Promise<void>; restore: () => Promise<void>; buy: (offer: AppleOffer) => Promise<void>
}
const unavailable = async () => { throw new Error('App Store is not connected') }
export const useAppleBillingStore = create<BillingState>(() => ({ ready: false, busy: false, offers: [], message: '', error: '', revision: 0, reload: unavailable, restore: unavailable, buy: unavailable }))
