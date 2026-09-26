import type { ReactNode } from 'react'
import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { DoodleStars } from '@/components/ui/Doodles'
import { LEGAL_ENTITY, PRIVACY_VERSION, DPC, legalEntityName, versionLabel } from './legalMeta'
import { RETENTION_PERIOD_DAYS as P, describeRetentionDays as days } from '../../../../../packages/shared/retentionPeriods'

/**
 * Privacy Policy. Every processor, retention period and automated decision
 * listed here was taken from the code as of PRIVACY_VERSION — when a new
 * provider, data field or retention rule is added, update this page and bump
 * PRIVACY_VERSION (packages/shared/types/index.ts) so users are asked again.
 */

interface Processor {
  name: string
  purpose: string
  data: string
  when: string
}

const PROCESSORS: Processor[] = [
  { name: 'Render', purpose: 'Runs the RentOS servers (API)', data: 'All data the service handles, in transit and in memory', when: 'Always' },
  { name: 'MongoDB Atlas', purpose: 'Database hosting', data: 'All account, tenancy, payment and message records', when: 'Always' },
  { name: 'Vercel', purpose: 'Hosts the website', data: 'Your IP address and the pages you request; custom domain names of storefronts', when: 'When you use the website' },
  { name: 'Redis (cache, via our hosting)', purpose: 'Rate limiting and short-lived caching', data: 'IP address or account ID for rate limits; recent search results for about 5 minutes', when: 'When enabled on our servers' },
  { name: 'Cloudinary', purpose: 'Stores and serves uploaded files', data: 'Profile photos, property photos, and documents you upload (which can include identity documents)', when: 'When you upload a file' },
  { name: 'Paystack', purpose: 'Payment processing, including MTN MoMo, Telecel Cash and AirtelTigo Money', data: 'Name, email, phone number, amount and reference; for payouts and merchant accounts, bank or mobile-money account details', when: 'When you pay, receive a payout, or sell through the marketplace' },
  { name: 'Mobile-network operators (MTN, Telecel, AirtelTigo)', purpose: 'Direct mobile-money collection where we have enabled it', data: 'Phone number, amount and reference', when: 'Only when a direct operator connection is switched on' },
  { name: 'Resend', purpose: 'Sends email', data: 'Email address, name and the content of the email (which can include message previews)', when: 'Account, notification and invitation emails' },
  { name: 'Expo, Apple Push Notification service, Google Firebase Cloud Messaging', purpose: 'Delivers push notifications', data: 'Device push token and the notification title and text', when: 'When you allow notifications on a device' },
  { name: 'Anthropic', purpose: 'AI features: legal assistant, listing writer, translation, dispute case summaries', data: 'The text you submit and, for case summaries, the statements in that dispute', when: 'Only when you confirm sharing for that request' },
  { name: 'OpenAI', purpose: 'Text embeddings for search and matching', data: 'Listing title, description, city and rent (whenever a listing is created or updated); your search or legal-search query; tenant search preferences for recommendations where offered', when: 'Listings: always. Searches: when you confirm sharing' },
  { name: 'Baseten', purpose: 'Rent price estimates', data: 'Property features only (type, size, location, amenities) — no names or contact details', when: 'When a price estimate is requested' },
  { name: 'Sentry', purpose: 'Error monitoring', data: 'Technical error details; your account ID on server errors; on the website, a replay of the session in which an error occurred with all text and form fields masked and images blocked', when: 'When an error occurs' },
  { name: 'Apple (App Store) and Google (Google Play)', purpose: 'In-app subscription purchases', data: 'We receive a transaction ID and an account token that is not your name or email. Apple and Google process your payment under their own privacy policies', when: 'When you buy a plan in the iOS or Android app' },
  { name: 'OpenStreetMap', purpose: 'Map tiles on the website', data: 'Your IP address and the map area viewed', when: 'When a map is shown' },
  { name: 'Google Fonts', purpose: 'Website fonts', data: 'Your IP address', when: 'When you load the website' },
  { name: 'Public image hosts (e.g. Pixabay)', purpose: 'Some default images in the mobile app', data: 'Your device IP address', when: 'When those images load' },
]

const list = (items: ReactNode[]) => (
  <ul className="list-disc pl-5 space-y-2">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
)

const mail = (address: string) => <a className="underline" href={`mailto:${address}`}>{address}</a>

export function PrivacyPage() {
  const controller = legalEntityName()
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="What we collect, why, who we share it with, and your rights"
      icon="shield"
      lastUpdated={versionLabel(PRIVACY_VERSION)}
      headerExtra={<DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />}
      sections={[
        {
          id: 'who-we-are',
          title: 'Who We Are',
          content: (
            <>
              <p>This Privacy Policy explains how {controller} ("RentOS", "we", "us") handles personal data when you use the RentOS website ({LEGAL_ENTITY.website.replace('https://', '')}), the RentOS mobile apps, and related services. RentOS is the data controller for this processing under the Data Protection Act, 2012 (Act 843) of Ghana.</p>
              {LEGAL_ENTITY.dpcRegistrationNumber && (
                <p className="mt-2">Data Protection Commission registration number: {LEGAL_ENTITY.dpcRegistrationNumber}.</p>
              )}
              <p className="mt-2">Contact for anything in this policy: {mail(LEGAL_ENTITY.privacyEmail)} ({LEGAL_ENTITY.location}).</p>
            </>
          ),
        },
        {
          id: 'information-collected',
          title: 'Information We Collect',
          content: list([
            <><strong>Account details:</strong> name, email address, phone number, the role(s) you use RentOS in, and your password (stored only as a one-way hash). If you turn on two-factor authentication we store the authenticator secret.</>,
            <><strong>Acceptance records:</strong> the Terms and Privacy Policy versions you accepted, when, your confirmation that you are 18 or older, and the IP address and browser/app details sent with that request.</>,
            <><strong>Identity verification (optional):</strong> your Ghana Card number and any identity document you upload so our team can review it.</>,
            <><strong>Tenant profile (optional):</strong> details you choose to add, such as date of birth, household (spouse, children, dependents, occupants), employment, income and income sources, education, languages, lifestyle (smoking, drinking, pets, noise, dietary needs), religion, references, emergency contact, rental and eviction history, budget and search preferences, and proof-of-income or proof-of-address documents. Religion and dietary needs can reveal special personal data (religious belief or health). They are never required — leave them blank unless you want landlords you share your profile with to see them.</>,
            <><strong>Tenancy and property records:</strong> listings (address, photos, rent, features), applications, agreements and signatures, move-in/move-out and inspection records, maintenance requests, disputes and the statements in them, reviews, and favourites.</>,
            <><strong>Money:</strong> rent and other payments, receipts, wallet and savings-plan records, payout accounts (bank or mobile-money numbers), and — if you use them — loan, financing, insurance, investment and payroll-deduction records. We never receive your mobile-money PIN or card number.</>,
            <><strong>Scores:</strong> credit scoring is not currently offered. Where it is (only with a licensed provider), a Rent Credit Score may be calculated from your payment, savings, agreement and dispute history on RentOS and your account age.</>,
            <><strong>Messages and reports:</strong> chat messages, content you report, and people you block. Messages are not end-to-end encrypted.</>,
            <><strong>Business and work profiles:</strong> for service providers, businesses, employers, agents and financiers — the business and contact details you enter (for employers this includes TIN and SSNIT employer number, and employee records you add).</>,
            <><strong>Device and usage data:</strong> IP address, device and browser type, push-notification tokens, and server logs. Views of public registry pages are recorded with a one-way hash of the IP address, the browser details and the referring page.</>,
          ]),
        },
        {
          id: 'how-we-use',
          title: 'How We Use It, and Why We May',
          content: (
            <>
              {list([
                <><strong>To provide the service you signed up for</strong> (performance of our contract with you): accounts, listings, applications, agreements, payments and receipts, savings, messaging, maintenance, disputes and notifications.</>,
                <><strong>With your consent:</strong> sending text to AI providers (asked each time), optional profile details, landlord tax-reporting sharing, push notifications, and optional email and push notifications (Settings → Notifications). You can withdraw consent at any time; this does not affect processing already done.</>,
                <><strong>To meet legal obligations:</strong> keeping financial and tenancy records, responding to lawful requests from courts and authorities.</>,
                <><strong>For legitimate interests that do not override your rights:</strong> keeping the service secure, preventing fraud and abuse, reviewing listings and reported content, fixing errors, and producing aggregated statistics about the rental market.</>,
              ])}
              <p className="mt-3">We do not sell your personal data and we do not use it for third-party advertising.</p>
              <p className="mt-3">Some listings and businesses are paid placements and are labelled Sponsored. We choose them only from the page you are on and the filters you set, not from your profile or history, and we count how often each is shown in total without recording who saw it. The RentOS mobile apps do not show paid placements.</p>
            </>
          ),
        },
        {
          id: 'automated-decisions',
          title: 'Automated Decisions',
          content: (
            <>
              <p>Some decisions are made automatically, without a person reviewing them first:</p>
              {list([
                'Micro-loans, rent financing and credit scoring are not currently offered. If they are introduced (only with a licensed provider), a score may pre-qualify an application, but a person makes the final decision and you can ask for any decline to be reviewed.',
                'Landlords can set screening criteria (for example, whether they accept smokers, pets or children) that automatically hide their listings from tenants who do not meet them. A minimum credit score applies only where credit scoring is offered.',
                'Our systems flag agreements that may breach rental law (for example, rent advance above the legal limit). These flags are information, not a legal finding.',
              ])}
              <p className="mt-3">You can ask for a person to review any automated decision about you, explain the main factors behind it, and hear your point of view: email {mail(LEGAL_ENTITY.privacyEmail)} with the subject "Human review".</p>
            </>
          ),
        },
        {
          id: 'data-sharing',
          title: 'Who We Share It With',
          content: list([
            <><strong>Other users, as the service requires:</strong> landlords and agents see the applications and profile information you send them; parties to an agreement or dispute see what is relevant to it; where financing or payroll deductions are offered (they are not currently), financiers see applications you submit to them and employers see the housing and deduction records you link to them; public listings are visible to anyone.</>,
            <><strong>RentOS staff and appointed officials:</strong> our administrators, and officials we give an account (for example, rent-control or legal officers who mediate disputes), can see what their role needs under access controls and audit logging — including the user directory (name, email, phone, role), identity-verification requests with the Ghana Card number submitted, disputes they handle, and failed-payment records reviewed for fraud. Gross rent totals are visible to government accounts only for landlords who switch on tax reporting. Market statistics we publish are aggregated.</>,
            <><strong>Service providers</strong> that process data for us, listed below.</>,
            <><strong>Integrations you set up:</strong> if your organisation registers a webhook, the record IDs and titles it subscribes to are sent to the address you chose.</>,
            <><strong>Authorities and advisers:</strong> where the law requires it, to protect people from harm, or to establish or defend legal claims.</>,
          ]),
        },
        {
          id: 'processors',
          title: 'Service Providers We Use',
          content: (
            <div className="space-y-3">
              {PROCESSORS.map((p) => (
                <div key={p.name} className="rounded-xl border border-border dark:border-[#252a3a] p-3">
                  <p className="font-semibold text-primary-dark dark:text-white">{p.name}</p>
                  <p className="mt-1 text-sm"><span className="font-medium">Purpose:</span> {p.purpose}</p>
                  <p className="text-sm"><span className="font-medium">Data:</span> {p.data}</p>
                  <p className="text-sm"><span className="font-medium">When:</span> {p.when}</p>
                </div>
              ))}
              <p>We do not currently send text messages (SMS), use analytics or advertising trackers, or use an external identity-verification provider — identity documents are reviewed by our own team.</p>
            </div>
          ),
        },
        {
          id: 'cross-border',
          title: 'Transfers Outside Ghana',
          content: <p>Most of the providers above are based, or store data, outside Ghana — for example in the United States or the European Union — so using RentOS involves transferring your personal data abroad. We choose providers that commit by contract to protect the data and to use it only to provide their service to us, and we take the further steps the Data Protection Act requires for such transfers.</p>,
        },
        {
          id: 'retention',
          title: 'How Long We Keep It',
          content: (
            <div className="space-y-3">
              <p>Your account data is kept while your account is open, unless a shorter period below applies.</p>
              <p><strong>When you close your account</strong> (in Settings → Privacy, or by asking us by email), we straight away take down your listings and your service-provider, business, storefront and agency profiles, release any custom domain, stop sharing your tenant profile and tenant passport links, sign you out on every device, and erase or scramble your name, email, phone number, Ghana Card number, photo, two-factor secret and the IP address and device details recorded with your acceptance of our terms.</p>
              <p><strong>{days(P.accountErasureGrace)} later</strong> we delete the rest of your personal records, including your tenant profile, photos, identity documents, payout accounts, saved properties, notifications, messages you sent (these are removed from the other person's conversation too), applications that were not approved, and your listings and profiles. Enquiries you sent are deleted or, where an agent keeps the lead, kept without your contact details. Reviews you wrote stay, with your name replaced by "Deleted User". Where a tenancy, payment or booking refers to one of your listings or profiles, we keep that record with its photos and contact details removed. If a payout to you is still being processed, we finish it first.</p>
              <p><strong>Records we keep while we confirm the legal retention period.</strong> We keep the following, including after you close your account, while RentOS confirms how long the law requires us to keep them, and we do not use them for anything else in the meantime: tenancy agreements and signatures, renewals, move-in and move-out records, maintenance requests, disputes and their evidence, approved applications and tenancy documents (agreements, receipts and notices); rent payments, receipts, payouts, wallet and other payment records; loan, financing, insurance, investment, savings and payroll records where those services are offered; and reports that led to action against an account. The other party to a tenancy or payment relies on these records.</p>
              <p><strong>Security log.</strong> Our security log of sign-ins, account changes and the acceptance of our terms, including the IP address and browser or app details recorded at the time, is kept for {days(P.auditLog)}, including after you close your account.</p>
              {list([
                `Notifications: deleted ${days(P.readNotification)} after they were sent once you have read them, and ${days(P.unreadNotification)} after they were last updated otherwise. Messages are kept while your account is open.`,
                `Applications that were not approved: ${days(P.unapprovedApplication)} after their last update.`,
                `Enquiries and viewing requests: ${days(P.enquiry)} after their last update.`,
                `Requests to see your tenant profile that you denied or withdrew: ${days(P.closedProfileAccess)} after your answer.`,
                `Profile photos you have replaced: deleted within ${days(P.replacedAvatar)}.`,
                `Reports we dismiss: ${days(P.dismissedContentReport)} after review (reports we act on are kept with the moderation record, as above).`,
                `Rent price estimate logs: ${days(P.valuationLog)}. Redacted complaint records: ${days(P.complaintLog)}. Payment-provider notifications: ${days(P.webhookEvent)}. App-store notifications: ${days(P.storeNotification)} after processing. Public registry page views (hashed IP address, browser and referring page): ${days(P.registryPageView)}. Storefront visit statistics: ${days(P.storefrontEvent)}.`,
                'Sign-in sessions expire after 7 days of inactivity; biometric sign-in on a device after 90 days; password-reset links after 1 hour.',
                'AI requests are not stored by RentOS; the AI provider handles them under its own retention terms.',
              ])}
              <p><strong>Files.</strong> Photos and documents are stored with Cloudinary. When we delete one, we ask Cloudinary to delete it and to clear the copies held in its content-delivery network. Dispute evidence is stored privately and can only be opened by the parties to the dispute and the officials handling it.</p>
              <p><strong>Backups.</strong> Deleted data can remain in our encrypted database backups until those backups expire. Backups are used only to recover from failures. We keep a record of every deletion, holding only an account or record number and never your name or contact details, until the last backup that could contain the data has expired; before any restored copy goes live, we apply those deletions to it again.</p>
            </div>
          ),
        },
        {
          id: 'security',
          title: 'Security',
          content: list([
            'Encrypted connections (HTTPS) in production.',
            'Passwords hashed with bcrypt; optional two-factor authentication.',
            'Role-based access control and audit logging of sensitive actions, including sign-ins, password and two-factor changes.',
            'App-store billing tokens are encrypted before storage.',
            'If a security breach affects your personal data, we will notify the Data Protection Commission and affected users as the Data Protection Act requires.',
          ]),
        },
        {
          id: 'cookies',
          title: 'Cookies, Local Storage and Third-Party Requests',
          content: <p>The website keeps your sign-in session and preferences (theme, language, completed tours) in your browser's local storage. We do not use advertising or analytics cookies. Loading the website contacts Google Fonts, OpenStreetMap (for maps) and, when an error occurs, Sentry — each receives your IP address.</p>,
        },
        {
          id: 'your-rights',
          title: 'Your Rights',
          content: (
            <>
              <p>Under the Data Protection Act, 2012 (Act 843) you can:</p>
              {list([
                <><strong>Access and export</strong> your data — use the export option in Settings → Privacy on the website or in the app, or email us. The export includes every kind of personal data linked to your account.</>,
                <><strong>Correct</strong> inaccurate data — edit your profile, or email us for anything you cannot edit.</>,
                <><strong>Delete</strong> your account and data — Settings → Privacy, or <a className="underline" href="/delete-account">/delete-account</a> (subject to the records we must keep, above).</>,
                <><strong>Object to direct marketing.</strong> We do not send marketing messages today; if we ever do, you will be able to opt out in every message and in Settings.</>,
                <><strong>Withdraw consent</strong> — turn off optional notifications in Settings → Notifications (every optional email has an unsubscribe link), decline AI sharing when asked, remove optional profile details, or switch off tax reporting.</>,
                <><strong>Ask for human review</strong> of an automated decision (see above).</>,
                <><strong>Object</strong> to processing based on our legitimate interests, or ask us to restrict it while a complaint is resolved.</>,
              ])}
              <p className="mt-3">Email {mail(LEGAL_ENTITY.privacyEmail)} to exercise any right. We may need to confirm your identity first. If you are not satisfied with our answer, you can complain to the {DPC.name} at <a className="underline" href={DPC.website} target="_blank" rel="noopener noreferrer">{DPC.websiteLabel}</a>.</p>
            </>
          ),
        },
        {
          id: 'children',
          title: 'Children',
          content: <p>RentOS is only for people aged 18 or over, and everyone confirms their age when they create an account or accept these terms. If you believe a child has created an account, email us and we will delete it.</p>,
        },
        {
          id: 'changes',
          title: 'Changes to This Policy',
          content: <p>This is version {PRIVACY_VERSION}. When we change this policy materially we publish a new version and ask you to review and accept it the next time you use RentOS.</p>,
        },
        {
          id: 'contact',
          title: 'Contact Us',
          content: (
            <div className="rounded-xl bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] p-4">
              <p className="font-medium text-primary-dark dark:text-white">{controller} — privacy enquiries</p>
              <p className="mt-2">Email: {mail(LEGAL_ENTITY.privacyEmail)}</p>
              <p>Location: {LEGAL_ENTITY.location}</p>
            </div>
          ),
        },
      ]}
    />
  )
}
