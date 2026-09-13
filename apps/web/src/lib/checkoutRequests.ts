import { createCheckoutRequests } from '../../../../packages/shared/checkoutRequests'

export const checkoutRequest = createCheckoutRequests({
  digest: async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join(''),
  randomId: () => crypto.randomUUID(),
  read: async key => localStorage.getItem(key),
  write: async (key, value) => localStorage.setItem(key, value),
  remove: async key => localStorage.removeItem(key),
  lock: async (key, work) => await navigator.locks.request(key, work),
})
