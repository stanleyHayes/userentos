/**
 * Contact protection in the app (TRUST-2). When the server stops a message or
 * text for sharing contact details or moving the deal off RentOS, the request
 * fails with `blocked: true`. The text is never thrown away: the person sees
 * why, edits it and sends again, or asks for a person to review it.
 */
import { Alert } from 'react-native'
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

/** "Message not sent", with the reason, and a way to ask for a review. */
export function showContactBlocked(error: ContactBlockedError) {
  const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [{ text: 'Edit message', style: 'cancel' }]
  if (error.decisionId) {
    buttons.push({
      text: 'Ask for a review',
      onPress: () => {
        api.post<{ status: string }>(`/trust/decisions/${error.decisionId}/appeal`, {})
          .then(() => Alert.alert('Review requested', 'A person will look at it. If it was stopped by mistake, you will be able to send the same text.'))
          .catch((err: Error) => Alert.alert('Could not ask for a review', err.message))
      },
    })
  }
  Alert.alert('Message not sent', `${error.message}\n\nYour text is still in the box, so you can edit it and send again.`, buttons)
}
