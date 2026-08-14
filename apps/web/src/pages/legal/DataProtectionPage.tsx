import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { DoodleCircle } from '@/components/ui/Doodles'

export function DataProtectionPage() {
  return (
    <LegalPageShell
      title="Data Protection"
      subtitle="Our commitment to safeguarding your personal data"
      icon="lock"
      lastUpdated="March 20, 2026"
      headerExtra={<DoodleCircle className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />}
      sections={[
        {
          id: 'commitment',
          title: 'Our Commitment',
          content: <p>RentOS Ghana is committed to the protection of personal data in compliance with the Data Protection Act, 2012 (Act 843) of the Republic of Ghana. We have appointed a Data Protection Officer and registered with the Data Protection Commission as required by law.</p>,
        },
        {
          id: 'legal-basis',
          title: 'Legal Basis for Processing',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Consent:</strong> You provide explicit consent when creating an account and using our services.</li>
              <li><strong>Contractual Necessity:</strong> Processing required to fulfill rental agreements and financial services.</li>
              <li><strong>Legal Obligation:</strong> Compliance with Ghanaian financial regulations, the Rent Act, and court orders.</li>
              <li><strong>Legitimate Interest:</strong> Improving platform services, fraud prevention, and market analytics.</li>
            </ul>
          ),
        },
        {
          id: 'technical-measures',
          title: 'Technical Measures',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>TLS/SSL encryption for all data in transit.</li>
              <li>AES-256 encryption for sensitive data at rest.</li>
              <li>Password hashing using bcrypt with appropriate salt rounds.</li>
              <li>JWT-based authentication with expiring tokens.</li>
              <li>Role-based access control (RBAC) across all API endpoints.</li>
              <li>Input validation and sanitization using Zod schema validation.</li>
              <li>Audit logging for all sensitive operations.</li>
            </ul>
          ),
        },
        {
          id: 'organizational-measures',
          title: 'Organizational Measures',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>Staff training on data protection and privacy.</li>
              <li>Access to personal data restricted on a need-to-know basis.</li>
              <li>Regular security audits and penetration testing.</li>
              <li>Incident response procedures for data breaches.</li>
              <li>Data processing agreements with all third-party service providers.</li>
            </ul>
          ),
        },
        {
          id: 'cross-border',
          title: 'Cross-Border Data Transfers',
          content: (
            <>
              <p>Your data is primarily stored and processed within Ghana. Where data is transferred outside Ghana, we ensure adequate protection through:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Data processing agreements with standard contractual clauses.</li>
                <li>Verification that the receiving country has adequate data protection laws.</li>
                <li>Authorization from the Data Protection Commission where required.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'breach-notification',
          title: 'Data Breach Notification',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>We will notify the Data Protection Commission within 72 hours of becoming aware of a breach.</li>
              <li>We will notify affected users without undue delay if the breach poses a high risk.</li>
              <li>We will document all breaches and remedial actions taken.</li>
            </ul>
          ),
        },
        {
          id: 'children',
          title: "Children's Data",
          content: <p>RentOS is not intended for use by individuals under 18 years of age. We do not knowingly collect personal data from children.</p>,
        },
        {
          id: 'cookies',
          title: 'Cookies and Tracking',
          content: <p>We use essential cookies for authentication and session management. We use localStorage for persisting user preferences. We do not use third-party advertising trackers.</p>,
        },
        {
          id: 'dpo',
          title: 'Data Protection Officer',
          content: (
            <div className="rounded-xl bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] p-4">
              <p className="font-medium text-primary-dark dark:text-white">Data Protection Officer</p>
              <p className="mt-2">Email: dpo@rentos.gh</p>
              <p>Phone: +233 30 XXX XXXX</p>
              <p>Address: Data Protection Office, RentOS Ghana, Accra</p>
            </div>
          ),
        },
        {
          id: 'regulatory',
          title: 'Regulatory Authority',
          content: (
            <div className="rounded-xl bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] p-4">
              <p className="font-medium text-primary-dark dark:text-white">Data Protection Commission of Ghana</p>
              <p className="mt-2">Accra, Ghana</p>
              <p>Website: dataprotection.org.gh</p>
            </div>
          ),
        },
      ]}
    />
  )
}
