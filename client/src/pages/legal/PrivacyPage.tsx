import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { DoodleStars } from '@/components/ui/Doodles'

export function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your data"
      icon="shield"
      lastUpdated="March 20, 2026"
      headerExtra={<DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />}
      sections={[
        {
          id: 'introduction',
          title: 'Introduction',
          content: <p>RentOS Ghana ("we", "our", "us") is committed to protecting and respecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform, including the website at rentos.gh and the RentOS mobile application.</p>,
        },
        {
          id: 'information-collected',
          title: 'Information We Collect',
          content: (
            <>
              <p>We collect the following types of information:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li><strong>Personal Information:</strong> Name, email address, phone number, Ghana Card ID (optional), and profile photo.</li>
                <li><strong>Financial Information:</strong> Rent payment history, savings plan data, wallet transactions, and investment records. We do not store bank account or mobile money PINs.</li>
                <li><strong>Property Information:</strong> Addresses, rental amounts, agreement terms, and uploaded images/documents.</li>
                <li><strong>Usage Data:</strong> Log data, device information, IP address, browser type, and pages visited.</li>
                <li><strong>Communications:</strong> Messages sent through the dispute resolution system and AI legal assistant interactions.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'how-we-use',
          title: 'How We Use Your Information',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide and maintain the RentOS platform and its services.</li>
              <li>To process rent payments and manage financial transactions through licensed partner banks.</li>
              <li>To verify your identity when required (e.g., Ghana Card verification).</li>
              <li>To generate rental agreements and check compliance with Ghanaian rental law.</li>
              <li>To calculate your Rent Credit Score based on payment and savings history.</li>
              <li>To send notifications about payments, disputes, and account activity.</li>
              <li>To provide government bodies with anonymized, aggregated data for housing policy decisions.</li>
              <li>To improve our services through analytics and user feedback.</li>
            </ul>
          ),
        },
        {
          id: 'data-sharing',
          title: 'Data Sharing',
          content: (
            <>
              <p>We may share your information with:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li><strong>Licensed Partner Banks:</strong> For processing payments and managing RentGuard savings wallets. Funds are held by these partners, not by RentOS.</li>
                <li><strong>Licensed Investment Firms:</strong> If you opt into the investment layer, your data is shared with the selected fund manager.</li>
                <li><strong>Government Authorities:</strong> The Rent Control Department and Ministry of Works & Housing may access anonymized data. Individual data is shared only pursuant to lawful requests.</li>
                <li><strong>Dispute Parties:</strong> Information relevant to a filed dispute is shared with the other party and mediators.</li>
              </ul>
              <p className="mt-3 font-medium text-primary-dark dark:text-white">We do not sell your personal data to third parties.</p>
            </>
          ),
        },
        {
          id: 'security',
          title: 'Data Security',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>End-to-end encryption for sensitive data transmission.</li>
              <li>Hashed and salted password storage (bcrypt).</li>
              <li>Role-based access control limiting data access to authorized users.</li>
              <li>Audit logging of all document and agreement actions.</li>
              <li>Regular security assessments and vulnerability testing.</li>
            </ul>
          ),
        },
        {
          id: 'retention',
          title: 'Data Retention',
          content: <p>We retain your data for as long as your account is active or as needed to provide services. Financial transaction records are retained for a minimum of 7 years in compliance with Ghanaian financial regulations. You may request deletion of your account and personal data at any time, subject to legal retention requirements.</p>,
        },
        {
          id: 'your-rights',
          title: 'Your Rights',
          content: (
            <>
              <p>Under the Data Protection Act, 2012 (Act 843) of Ghana, you have the right to:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Access your personal data held by RentOS.</li>
                <li>Request correction of inaccurate data.</li>
                <li>Request deletion of your data (subject to legal obligations).</li>
                <li>Withdraw consent for data processing.</li>
                <li>Lodge a complaint with the Data Protection Commission of Ghana.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'contact',
          title: 'Contact Us',
          content: (
            <div className="rounded-xl bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] p-4">
              <p className="font-medium text-primary-dark dark:text-white">Data Protection Officer</p>
              <p className="mt-2">Email: privacy@rentos.gh</p>
              <p>Phone: +233 30 XXX XXXX</p>
              <p>Address: Accra, Ghana</p>
            </div>
          ),
        },
      ]}
    />
  )
}
