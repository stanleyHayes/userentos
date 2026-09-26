/**
 * What an agent is told about a new lead or viewing request.
 *
 * The enquirer's name and phone number stay on the Lead / Viewing record,
 * which is anonymised when the enquirer's account is erased. They are never
 * copied into the notification: a notification sits in the agent's inbox (and
 * email and push history) for up to two years and nothing anonymises it.
 */
export const NEW_LEAD_TITLE = 'New Lead'
export const VIEWING_REQUESTED_TITLE = 'Viewing Requested'

export const newLeadMessage = () => 'Someone is interested in your listing. Their contact details are in your leads.'

export const viewingRequestedMessage = (date: string, time: string) => `A viewing was requested for ${date} at ${time}. The details are in your viewings.`

/** The wording used before, which quoted the enquirer; erasure rewrites any still stored. */
export const legacyLeadMessage = (name: string, phone: string) => `${name} is interested in your listing. Reach them at ${phone}.`
export const legacyViewingMessage = (name: string, date: string, time: string) => `${name} requested a viewing on ${date} at ${time}.`
