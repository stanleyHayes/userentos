import { Link } from 'react-router-dom'
import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { LEGAL_ENTITY, legalEntityName } from './legalMeta'

/**
 * Public support and safety contacts. The app stores' "Support URL" points
 * here, so it must work without an account and list real, monitored contacts
 * only — no phone line is published until a staffed one exists.
 */
export function SupportPage() {
  const email = (address: string, subject?: string) => (
    <a className="font-semibold text-primary underline dark:text-blue-400" href={`mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}>{address}</a>
  )
  return (
    <LegalPageShell
      title="Support"
      subtitle={`How to reach ${legalEntityName()} and report a problem`}
      icon="shield"
      lastUpdated="25 September 2026"
      sections={[
        {
          id: 'contact',
          title: 'Contact us',
          content: (
            <p>
              Email {email(LEGAL_ENTITY.supportEmail, 'RentOS support')} for help with your account, listings, agreements, payments or the app.
              Include the email address on your account and, if it concerns a listing, agreement or payment, its reference.
            </p>
          ),
        },
        {
          id: 'safety',
          title: 'Report abusive content or users',
          content: (
            <>
              <p>In the app you can report a message, user, listing, review, business or service provider from its menu, and block anyone who contacts you. Reports go to our moderation team, who act within 24 hours.</p>
              <p className="mt-2">If you can’t use the app, email {email(LEGAL_ENTITY.supportEmail, 'Safety report')} with a description and, where possible, a link or screenshot. If someone is in immediate danger, contact the Ghana Police Service first.</p>
            </>
          ),
        },
        {
          id: 'privacy',
          title: 'Your data and your account',
          content: (
            <p>
              You can download your data or delete your account in the app (Settings → Privacy) or on the <Link className="font-semibold text-primary underline dark:text-blue-400" to="/delete-account">account deletion page</Link>.
              For other privacy requests email {email(LEGAL_ENTITY.privacyEmail, 'Privacy request')}. See the <Link className="font-semibold text-primary underline dark:text-blue-400" to="/privacy">Privacy Policy</Link> and <Link className="font-semibold text-primary underline dark:text-blue-400" to="/terms">Terms of Service</Link>.
            </p>
          ),
        },
        {
          id: 'subscriptions',
          title: 'App Store and Google Play subscriptions',
          content: (
            <p>
              Plans bought in the iOS or Android app are billed and refunded by Apple or Google. Manage or cancel them in your App Store or Google Play subscription settings; deleting your RentOS account does not cancel them.
            </p>
          ),
        },
      ]}
    />
  )
}
