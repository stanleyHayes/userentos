import { create } from 'zustand'
export interface GoogleOffer {
  key: string; productId: string; offerToken: string; name: string; maxProperties: number; benefits: string[]; terms: string
}
interface BillingState {
  ready: boolean; busy: boolean; offers: GoogleOffer[]; message: string; error: string; revision: number
  reload: () => Promise<void>; restore: () => Promise<void>; buy: (offer: GoogleOffer) => Promise<void>
}
const unavailable = async () => { throw new Error('Google Play is not connected') }
export const useGoogleBillingStore = create<BillingState>(() => ({ ready: false, busy: false, offers: [], message: '', error: '', revision: 0, reload: unavailable, restore: unavailable, buy: unavailable }))
