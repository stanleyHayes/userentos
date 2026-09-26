import { PrivacyControls } from '../settings/PrivacyControls'
import { CONTACT_EMAIL } from '@/lib/contact'

export function DeleteAccountPage() {
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
    <h1 className="text-3xl font-bold">Delete your RentOS Ghana account</h1>
    <PrivacyControls />
    <p>Deleted data can remain in our encrypted database backups until those backups expire. Every deletion is recorded and applied again before any restored copy goes live. The <a className="underline" href="/privacy#retention">Privacy Policy</a> lists how long each kind of data is kept.</p>
    <p>If you cannot sign in, request account or specific personal-data deletion by emailing <a className="underline" href={`mailto:${CONTACT_EMAIL.info}?subject=RentOS%20account%20deletion`}>{CONTACT_EMAIL.info}</a> from your registered email. Include your account email and the data you want deleted. Do not send your password or payment PIN. We may ask you to verify ownership before processing your request.</p>
  </main>
}
