import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { DoodleCircle } from '@/components/ui/Doodles'
import { LEGAL_ENTITY, PRIVACY_VERSION, DPC, legalEntityName, versionLabel } from './legalMeta'
import { RETENTION_PERIOD_DAYS, describeRetentionDays } from '../../../../../packages/shared/retentionPeriods'

/**
 * Plain-language data-protection summary. It states only what the code and
 * the operator can stand behind — no registration, officer appointment,
 * storage location, encryption scheme or notification deadline is claimed
 * unless it is true. Details live in the Privacy Policy; keep the two in step
 * and version-stamped with PRIVACY_VERSION.
 */
export function DataProtectionPage() {
  const controller = legalEntityName()
  return (
    <LegalPageShell
      title="Data Protection"
      subtitle="How RentOS applies Ghana's Data Protection Act"
      icon="lock"
      lastUpdated={versionLabel(PRIVACY_VERSION)}
      headerExtra={<DoodleCircle className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />}
      sections={[
        {
          id: 'commitment',
          title: 'Our Commitment',
          content: (
            <>
              <p>{controller} processes personal data in line with the Data Protection Act, 2012 (Act 843) of the Republic of Ghana. This page summarises how; the <a className="underline" href="/privacy">Privacy Policy</a> has the full detail, including every service provider we use.</p>
              {LEGAL_ENTITY.dpcRegistrationNumber && (
                <p className="mt-2">We are registered with the Data Protection Commission (registration number {LEGAL_ENTITY.dpcRegistrationNumber}).</p>
              )}
            </>
          ),
        },
        {
          id: 'legal-basis',
          title: 'Legal Basis for Processing',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Contract:</strong> to provide the account and services you signed up for — listings, applications, agreements, payments, savings, messaging and disputes.</li>
              <li><strong>Consent:</strong> for optional processing — AI features (asked each time), optional profile details, optional notifications and tax-reporting sharing. You can withdraw it at any time.</li>
              <li><strong>Legal obligation:</strong> keeping financial and tenancy records and answering lawful requests.</li>
              <li><strong>Legitimate interests:</strong> security, fraud and abuse prevention, content moderation, error fixing and aggregated market statistics.</li>
            </ul>
          ),
        },
        {
          id: 'technical-measures',
          title: 'Technical Measures',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>HTTPS encryption for connections in production.</li>
              <li>Passwords hashed with bcrypt; optional two-factor authentication.</li>
              <li>Short-lived sign-in tokens with refresh-token rotation, revoked when you change your password.</li>
              <li>Role-based access control on staff and official functions, and audit logs of sensitive actions.</li>
              <li>Input validation on API requests.</li>
              <li>Error monitoring that masks all text and form fields in session replays.</li>
            </ul>
          ),
        },
        {
          id: 'organizational-measures',
          title: 'Organisational Measures',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>Staff and official accounts only see what their role needs, and their actions are logged.</li>
              <li>Identity documents are reviewed by our own team, not sent to an outside verification company.</li>
              <li>Reported content and accounts are reviewed by people, not decided automatically.</li>
            </ul>
          ),
        },
        {
          id: 'cross-border',
          title: 'Transfers Outside Ghana',
          content: <p>Our hosting, database, email, file-storage, payment, AI and error-monitoring providers are based or store data outside Ghana, so using RentOS involves transferring personal data abroad. We use providers that commit by contract to protect it and to use it only to serve us, and we take the further steps the Data Protection Act requires. See the <a className="underline" href="/privacy#processors">provider list</a>.</p>,
        },
        {
          id: 'breach-notification',
          title: 'Data Breaches',
          content: <p>If a security breach affects your personal data, we will notify the Data Protection Commission and the people affected as the Data Protection Act requires, and keep a record of the breach and what we did about it.</p>,
        },
        {
          id: 'retention',
          title: 'Retention and Deletion',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>The <a className="underline" href="/privacy#retention">Privacy Policy</a> lists how long each kind of personal data is kept, including the records kept while the legal period is confirmed.</li>
              <li>Closing your account takes your listings and public profiles down at once and erases your core identity; the rest of your personal records are deleted {describeRetentionDays(RETENTION_PERIOD_DAYS.accountErasureGrace)} later.</li>
              <li>Tenancy, payment and moderation records are kept while RentOS confirms how long the law requires them to be kept, and are not used for anything else in the meantime.</li>
              <li>Deleted data can remain in our encrypted database backups until those backups expire. Account closures, and the documents, listings, listing photos, reviews, business listings, payout accounts and webhooks you delete, are recorded and applied again before any restored copy goes live, together with our scheduled retention deletions.</li>
              <li>Deleted files are removed from our file-storage provider, Cloudinary, together with the copies in its content-delivery network.</li>
            </ul>
          ),
        },
        {
          id: 'rights',
          title: 'Your Rights',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>See and export your data (Settings → Privacy), and correct it.</li>
              <li>Delete your account (Settings → Privacy or <a className="underline" href="/delete-account">/delete-account</a>), subject to records the law requires us to keep.</li>
              <li>Withdraw consent and turn off optional notifications (Settings → Notifications).</li>
              <li>Object to direct marketing and to processing based on our legitimate interests.</li>
              <li>Ask for a person to review a decision made about you automatically, such as a loan decision based on your Rent Credit Score.</li>
            </ul>
          ),
        },
        {
          id: 'children',
          title: "Children's Data",
          content: <p>RentOS is only for people aged 18 or over. Everyone confirms their age when they create an account or accept our terms, and we delete accounts we learn belong to a child.</p>,
        },
        {
          id: 'cookies',
          title: 'Cookies and Tracking',
          content: <p>We keep your sign-in session and preferences in your browser's local storage. We do not use advertising or analytics trackers.</p>,
        },
        {
          id: 'contact',
          title: 'Privacy Contact',
          content: (
            <div className="rounded-xl bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] p-4">
              <p className="font-medium text-primary-dark dark:text-white">{controller} — privacy enquiries</p>
              <p className="mt-2">Email: <a className="underline" href={`mailto:${LEGAL_ENTITY.privacyEmail}`}>{LEGAL_ENTITY.privacyEmail}</a></p>
              <p>Location: {LEGAL_ENTITY.location}</p>
            </div>
          ),
        },
        {
          id: 'regulatory',
          title: 'Regulatory Authority',
          content: (
            <div className="rounded-xl bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] p-4">
              <p className="font-medium text-primary-dark dark:text-white">{DPC.name}</p>
              <p className="mt-2">If you are unhappy with how we handled your data or a request, you can complain to the Commission.</p>
              <p className="mt-1">Website: <a className="underline" href={DPC.website} target="_blank" rel="noopener noreferrer">{DPC.websiteLabel}</a></p>
            </div>
          ),
        },
      ]}
    />
  )
}
