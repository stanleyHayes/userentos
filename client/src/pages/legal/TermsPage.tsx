import { LegalPageShell } from '@/components/ui/LegalPageShell'
import { DoodleZigzag } from '@/components/ui/Doodles'

export function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      subtitle="Rules and guidelines for using RentOS Ghana"
      icon="file"
      lastUpdated="March 20, 2026"
      headerExtra={<DoodleZigzag className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />}
      sections={[
        {
          id: 'acceptance',
          title: 'Acceptance of Terms',
          content: <p>By accessing or using the RentOS Ghana platform ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Platform. The Platform is operated by RentOS Ghana Limited, registered in the Republic of Ghana.</p>,
        },
        {
          id: 'platform',
          title: 'Platform Description',
          content: (
            <>
              <p>RentOS Ghana is a centralized digital rental ecosystem platform that provides:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Access to Ghanaian rental laws and legal education.</li>
                <li>Digital rental agreement creation with compliance checking.</li>
                <li>Rent payment processing via mobile money and bank transfer.</li>
                <li>RentGuard savings and financial planning tools.</li>
                <li>Dispute resolution services.</li>
                <li>Government monitoring and analytics tools.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'accounts',
          title: 'User Accounts',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>You must provide accurate and complete information when creating an account.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must be at least 18 years old to create an account.</li>
              <li>You may hold multiple roles (e.g., tenant and landlord) under one account.</li>
              <li>RentOS reserves the right to suspend or terminate accounts that violate these terms.</li>
            </ul>
          ),
        },
        {
          id: 'financial',
          title: 'Financial Services',
          content: (
            <>
              <p className="font-medium text-primary-dark dark:text-white">RentOS does not directly hold user funds.</p>
              <p className="mt-2">All financial transactions are processed through licensed partner banks and payment providers:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Rent payments are processed via MTN Mobile Money, Telecel Cash, AirtelTigo Money, or bank transfer.</li>
                <li>RentGuard savings wallets are linked to partner bank virtual accounts.</li>
                <li>Investment activities (treasury bills, government bonds) are handled exclusively by licensed investment firms.</li>
                <li>Micro-loans are subject to credit score assessment and are provided through licensed financial partners.</li>
                <li>RentOS operates as a tracking and orchestration platform for these financial services.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'agreements',
          title: 'Rental Agreements',
          content: (
            <ul className="list-disc pl-5 space-y-2">
              <li>Digital agreements created on the Platform are legally binding when signed by both parties.</li>
              <li>The Platform performs automated compliance checking against Ghanaian rental law, including rent advance limits.</li>
              <li>Users are responsible for the accuracy of information entered into agreements.</li>
              <li>Agreements flagged with compliance violations should be reviewed before signing.</li>
            </ul>
          ),
        },
        {
          id: 'disputes',
          title: 'Dispute Resolution',
          content: (
            <>
              <p>The Platform provides tools for filing and managing rental disputes. The dispute resolution process follows this hierarchy:</p>
              <ol className="list-decimal pl-5 space-y-2 mt-2">
                <li>Direct negotiation between parties through the Platform.</li>
                <li>Mediation facilitated by assigned mediators.</li>
                <li>Escalation to the Rent Control Department or relevant authority.</li>
                <li>Resolution and enforcement.</li>
              </ol>
              <p className="mt-3">RentOS does not act as an arbitrator or legal authority. For complex legal matters, users should consult a licensed legal practitioner.</p>
            </>
          ),
        },
        {
          id: 'ai',
          title: 'AI Legal Assistant',
          content: <p>The AI Legal Assistant provides general information about Ghanaian rental law. It does not constitute legal advice. Users should consult qualified legal professionals for specific legal situations. RentOS is not liable for actions taken based on AI assistant responses.</p>,
        },
        {
          id: 'liability',
          title: 'Limitation of Liability',
          content: (
            <>
              <p>RentOS Ghana shall not be liable for:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Losses arising from payment processing failures by third-party providers.</li>
                <li>Investment losses (returns are not guaranteed).</li>
                <li>Disputes between tenants and landlords beyond Platform-facilitated mediation.</li>
                <li>Inaccurate information provided by users.</li>
                <li>Service interruptions due to technical maintenance or force majeure.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'governing-law',
          title: 'Governing Law',
          content: <p>These Terms shall be governed by and construed in accordance with the laws of the Republic of Ghana. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts of Ghana.</p>,
        },
        {
          id: 'contact',
          title: 'Contact',
          content: (
            <div className="rounded-xl bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] p-4">
              <p className="font-medium text-primary-dark dark:text-white">Legal Department</p>
              <p className="mt-2">Email: legal@rentos.gh</p>
              <p>Phone: +233 30 XXX XXXX</p>
              <p>Address: Accra, Ghana</p>
            </div>
          ),
        },
      ]}
    />
  )
}
