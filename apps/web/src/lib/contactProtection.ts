/**
 * Contact protection on the client. When the server stops a message or a
 * piece of text because it shares contact details or moves the deal off
 * RentOS, the request fails with `blocked: true`. The text is never cleared:
 * the person sees why, edits and tries again, or asks for a review.
 */
import { api } from './api'

export interface ContactBlockedError extends Error {
  status: number
  blocked: true
  reason: string | null
  decisionId: string | null
}

export function isContactBlocked(error: unknown): error is ContactBlockedError {
  return error instanceof Error && (error as Partial<ContactBlockedError>).blocked === true
}

/** "This was a mistake": a person reviews the stopped message. */
export function appealDecision(decisionId: string, note?: string) {
  return api.post<{ status: string }>(`/trust/decisions/${decisionId}/appeal`, note ? { note } : {})
}
