import type { ReactNode } from 'react'
import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { DoodleZigzag } from '@/components/ui/Doodles'
import { LEGAL_ENTITY, TERMS_VERSION, legalEntityName, versionLabel } from './legalMeta'

/**
 * Terms of Service. Version-stamped with TERMS_VERSION; bump it (packages/
 * shared/types/index.ts) whenever this text changes materially so every user
 * is asked to accept the new version.
 */

const list = (items: ReactNode[]) => (
  <ul className="list-disc pl-5 space-y-2">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
)

const mail = (address: string) => <a className="underline" href={`mailto:${address}`}>{address}</a>

export function TermsPage() {
  const operator = legalEntityName()
  return (
    <LegalPageShell
      title="Terms of Service"
      subtitle="The agreement between you and RentOS"
      icon="file"
      lastUpdated={versionLabel(TERMS_VERSION)}
      headerExtra={<DoodleZigzag className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />}
      sections={[
        {
          id: 'acceptance',
          title: 'Acceptance of Terms',
          content: <p>These Terms are an agreement between you and {operator} ("RentOS", "we", "us"), which operates the RentOS website, mobile apps and related services (the "Platform"). By creating an account or using the Platform you agree to these Terms and confirm you have read the <a className="underline" href="/privacy">Privacy Policy</a>. If you do not agree, do not use the Platform. This is version {TERMS_VERSION}.</p>,
        },
        {
          id: 'eligibility',
          title: 'Who Can Use RentOS',
          content: list([
            'You must be at least 18 years old. You confirm this when you create an account.',
            'You must give accurate information and keep it up to date.',
            'If you use RentOS for a business or organisation, you confirm you are authorised to act for it.',
            'You are responsible for keeping your password and devices secure and for activity on your account. Tell us at once if you think your account has been misused.',
          ]),
        },
        {
          id: 'platform',
          title: 'What RentOS Does — and Does Not Do',
          content: (
            <>
              <p>RentOS provides tools for finding homes to rent or buy, listing property, messaging agents and landlords, booking viewings, applying, creating and signing tenancy agreements, recording and paying rent, running a business website on RentOS, handling maintenance and disputes, and learning about Ghanaian rental law.</p>
              {list([
                'RentOS is not a party to any tenancy between landlords and tenants, and is not a landlord, estate agent, bank, lender, insurer or law firm.',
                'Listings are written by landlords and agents. We review listings against our rules before they are published, but we do not inspect properties or confirm who owns them. View a property and check the landlord\'s documents before you pay anything.',
                'A "verified" identity badge means our team reviewed the identity document that person submitted. It is not a guarantee of their conduct, ownership of a property or right to let it.',
              ])}
            </>
          ),
        },
        {
          id: 'conduct',
          title: 'Acceptable Use and User Content',
          content: (
            <>
              <p className="font-medium text-primary-dark dark:text-white">We have zero tolerance for objectionable content and abusive users.</p>
              <p className="mt-2">You must not post, send or do anything that:</p>
              {list([
                'harasses, threatens, bullies or abuses anyone, or is hateful or discriminatory (including refusing housing on the basis of ethnicity, religion, gender, disability or other protected characteristics);',
                'is sexually explicit, violent or otherwise objectionable;',
                'is fraudulent or misleading — including fake listings, listings for property you have no right to let, requests for payment outside RentOS to avoid our protections, or impersonating someone else;',
                'is illegal, infringes someone else\'s rights, or shares another person\'s personal data without their permission;',
                'is spam, or attempts to break, overload or get around the security of the Platform.',
              ])}
              <p className="mt-3"><strong>Reporting and blocking.</strong> You can report a message or a user and block a contact from any chat. To report anything else — a listing, review, storefront or article — email {mail(LEGAL_ENTITY.supportEmail)} with a link to it.</p>
              <p className="mt-2"><strong>What we do.</strong> Our moderators review reports. Where content breaches these Terms we remove it, and we suspend or close the account responsible, within 24 hours of the report. We may also remove content or restrict accounts without a report.</p>
              <p className="mt-2"><strong>Your content.</strong> You keep ownership of what you post. You give RentOS a non-exclusive, royalty-free licence to host, store, display and share it as needed to operate the Platform (for example, showing your listing to tenants). The licence ends when you delete the content or your account, except where the content has been shared with others as part of an agreement or dispute, or we must keep it by law.</p>
            </>
          ),
        },
        {
          id: 'on-platform',
          title: 'Keeping Deals on RentOS',
          content: (
            <>
              <p>RentOS protects you by keeping each step of a deal where it can be seen and checked: the conversation, the viewing, the agreement and the payment. So, for anything you find, list or arrange through RentOS:</p>
              {list([
                'Keep enquiries, conversations, viewings, agreements and payments on RentOS. Agents, agencies, landlords and property managers receive enquiries through RentOS messages, with an alert by SMS, email or push notification.',
                'Do not share or ask for phone numbers, email addresses, social-media handles, messaging-app links or other contact details in order to continue a conversation, viewing, agreement or payment outside RentOS, and do not ask anyone to pay outside RentOS.',
                'Agents, agencies, landlords and property managers must not put contact details in listings, RentOS websites, profiles, posts or messages.',
              ])}
              <p className="mt-3"><strong>Automatic checks.</strong> To protect users, RentOS automatically checks messages and published text for contact details and for attempts to move a deal off RentOS, including details split across several messages or disguised. Text that does not pass is not sent or published; it stays with you to edit, and you can ask for a person to review the decision. The Privacy Policy explains what we keep.</p>
              <p className="mt-2"><strong>Suspension.</strong> An agent, agency, landlord or property manager who takes, or tries to take, a user off RentOS to deal or be paid outside it will have their account suspended, which can include removing their listings, leads and RentOS website. Any user who repeatedly tries to share contact details or move deals off RentOS may also be suspended. Suspension decisions are made by a person, and you can appeal (see Suspension and Termination).</p>
              <p className="mt-2"><strong>Deals outside RentOS are at your own risk.</strong> If you choose to communicate, view a property, sign an agreement or pay outside RentOS, RentOS's protections do not apply to it — screened messages, verified profiles, the record of your conversation and agreement, payment records and help with disputes — and RentOS is not liable for any loss, fraud or scam that results, including where you agreed to move the deal off RentOS. If anyone asks you to deal or pay outside RentOS, please report them.</p>
            </>
          ),
        },
        {
          id: 'agreements',
          title: 'Rental Agreements and Electronic Signatures',
          content: list([
            'Agreements are signed electronically on the Platform. Electronic signatures and records are recognised under the Electronic Transactions Act, 2008 (Act 772), but whether a particular agreement is enforceable depends on its terms and on the law, including the Rent Act, 1963 (Act 220). RentOS does not guarantee that any agreement is valid or enforceable.',
            'The Platform flags some terms that may breach rental law, such as rent advance above the legal limit. These checks are automated and incomplete; they are information, not legal advice or approval.',
            'You are responsible for the accuracy of what you enter into an agreement and for reading it before you sign.',
          ]),
        },
        {
          id: 'payments',
          title: 'Payments, Wallet and Savings',
          content: list([
            'Payments on the Platform are processed by third-party payment providers (currently Paystack, which also carries MTN MoMo, Telecel Cash and AirtelTigo Money). Their terms also apply. We do not receive your card number or mobile-money PIN.',
            'Your RentOS wallet and savings plans record amounts you have paid in and allocated. They are not bank deposits and do not earn interest unless a product clearly says so.',
            'Rent paid to a landlord is a matter between tenant and landlord. If something goes wrong, use the dispute tools; RentOS can help mediate but cannot force a refund between users.',
          ]),
        },
        {
          id: 'financial',
          title: 'Regulated Financial Services',
          content: (
            <>
              <p>Investments, loans, rent financing, insurance and payroll deductions are regulated activities in Ghana. On RentOS they are offered only where a partner licensed for that activity provides them, under that partner's own terms and disclosures. Where no licensed partner provides a feature, it is not available to you.</p>
              <p className="mt-2">RentOS is not a bank, investment adviser, lender or insurer and does not guarantee any return, approval or claim payment. Information on the Platform is not financial advice.</p>
            </>
          ),
        },
        {
          id: 'subscriptions',
          title: 'Subscriptions and Prices',
          content: list([
            'Listing plans are available to landlords and property managers. The free Starter plan has no charge.',
            <><strong>In the iOS and Android apps</strong>, paid plans are sold through the Apple App Store or Google Play as auto-renewing subscriptions. Payment is charged to your Apple or Google account. The subscription renews automatically at the end of each period unless you turn off auto-renew in your App Store or Google Play account settings at least 24 hours before the period ends. Manage or cancel it there — deleting the app or your RentOS account does not cancel a store subscription.</>,
            <><strong>On the website</strong>, paid plans are paid with mobile money for a fixed term (monthly or yearly) and do <strong>not</strong> renew automatically. When the term ends your account returns to the free plan unless you choose to pay again.</>,
            'Prices are shown in Ghana cedis (GHS). Any taxes or levies that apply are shown at checkout before you pay. In the apps, Apple or Google shows the final price, including any taxes they apply, before you confirm.',
          ]),
        },
        {
          id: 'refunds',
          title: 'Cancellation and Refunds',
          content: list([
            'App Store and Google Play purchases are refunded by Apple or Google under their refund policies — request a refund through them.',
            'Website plans do not renew, so there is nothing to cancel. If you were charged in error or did not receive what you paid for, email ' + LEGAL_ENTITY.supportEmail + ' and we will investigate and refund charges made in error.',
            'You can close your account at any time from Settings → Privacy. Closing your account does not cancel a store subscription, settle amounts you owe, or end a tenancy.',
            'Nothing in these Terms takes away rights you have under Ghanaian consumer-protection law.',
          ]),
        },
        {
          id: 'ai',
          title: 'AI Features',
          content: <p>The AI legal assistant, listing writer, translation, price estimates and case summaries generate automated suggestions that can be wrong or out of date. They are not legal, financial or valuation advice. Check anything important with a qualified professional before acting on it. Text you choose to send to an AI feature is processed by our AI providers as described in the Privacy Policy.</p>,
        },
        {
          id: 'disputes',
          title: 'Dispute Resolution Between Users',
          content: (
            <>
              <p>The Platform provides tools for raising and tracking rental disputes: direct negotiation, mediation by an assigned mediator where available, and guidance on escalating to the Rent Control Department or another authority.</p>
              <p className="mt-2">RentOS is not an arbitrator or court. For legal matters, consult a lawyer.</p>
            </>
          ),
        },
        {
          id: 'suspension',
          title: 'Suspension and Termination',
          content: <p>We may suspend or close an account that breaches these Terms (including taking or trying to take deals off RentOS — see Keeping Deals on RentOS), puts other users at risk, or where the law requires it. Where it is safe to do so we will tell you why. A suspended account keeps access to its existing agreements and rent payments and can still export or delete its data. You can appeal by emailing {mail(LEGAL_ENTITY.privacyEmail)}. If a message of yours was stopped by mistake, ask for a review from the message itself.</p>,
        },
        {
          id: 'liability',
          title: 'Limitation of Liability',
          content: (
            <>
              <p>To the extent the law allows, RentOS is not liable for:</p>
              {list([
                'the conduct of other users, or the condition, ownership or legality of any property listed;',
                'anything arranged, paid or signed outside RentOS, including losses to fraud or scams after you agreed to continue a deal outside the Platform;',
                'losses caused by payment providers, app stores or other third parties;',
                'investment losses, refused applications or unpaid claims under a partner\'s product;',
                'loss caused by inaccurate information you or other users provide;',
                'interruptions for maintenance or events beyond our reasonable control.',
              ])}
              <p className="mt-2">Nothing in these Terms limits liability that cannot be limited under Ghanaian law.</p>
            </>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to These Terms',
          content: <p>When we change these Terms materially we publish a new version and ask you to accept it before you continue using the Platform. If you do not accept, you can close your account.</p>,
        },
        {
          id: 'governing-law',
          title: 'Governing Law',
          content: <p>These Terms are governed by the laws of the Republic of Ghana, and the courts of Ghana have jurisdiction over any dispute arising from them.</p>,
        },
        {
          id: 'contact',
          title: 'Contact',
          content: (
            <div className="rounded-xl bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] p-4">
              <p className="font-medium text-primary-dark dark:text-white">{operator}</p>
              <p className="mt-2">Support: {mail(LEGAL_ENTITY.supportEmail)}</p>
              <p>Legal and privacy: {mail(LEGAL_ENTITY.privacyEmail)}</p>
              <p>Location: {LEGAL_ENTITY.location}</p>
            </div>
          ),
        },
      ]}
    />
  )
}
