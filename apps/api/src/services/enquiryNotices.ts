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

/**
 * Rewrites every stored notification still in the old wording, whoever sent
 * the enquiry: those from enquirers erased before the wording changed, or
 * whose lead was since purged, would otherwise keep their name and phone for
 * the notification's life. The new wording tells the agent the same thing.
 * Idempotent and cheap once done; run by the daily retention job.
 */
export async function rewriteLegacyEnquiryNotices(): Promise<{ leads: number; viewings: number }> {
  const { Notification } = await import('../models/Notification.js')
  const leads = await Notification.updateMany(
    { title: NEW_LEAD_TITLE, message: { $regex: /^.+ is interested in your listing\. Reach them at .+\.$/s } },
    { $set: { message: newLeadMessage() } },
    { timestamps: false },
  )
  const viewingPattern = /^.+ requested a viewing on (.+?) at (.+)\.$/s
  const viewings = await Notification.updateMany(
    { title: VIEWING_REQUESTED_TITLE, message: { $regex: viewingPattern } },
    [{
      $set: {
        message: {
          $let: {
            vars: { found: { $regexFind: { input: '$message', regex: viewingPattern } } },
            in: { $concat: ['A viewing was requested for ', { $arrayElemAt: ['$$found.captures', 0] }, ' at ', { $arrayElemAt: ['$$found.captures', 1] }, '. The details are in your viewings.'] },
          },
        },
      },
    }],
    { timestamps: false, updatePipeline: true },
  )
  return { leads: leads.modifiedCount, viewings: viewings.modifiedCount }
}
