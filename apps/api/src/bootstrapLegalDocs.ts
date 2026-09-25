import { RECEIPT_LEGAL_DOCUMENT, correctLegacyReceiptDocuments } from './services/legal/receiptCorpus.js'
/**
 * Idempotent bootstrap for legal document RAG corpus.
 * Seeds Ghanaian rental law documents with embeddings.
 * Safe to run multiple times — skips documents that already exist, except
 * untouched copies of superseded wording (see SUPERSEDED_CONTENT), which are
 * corrected and re-embedded.
 *
 * The advance limits here must match services/legal/rentLaw.ts and
 * maxAdvanceMonthsFor in services/legal/agreementCompliance.ts. No phone
 * numbers, street addresses or processing timelines: none could be verified.
 */
import { createHash } from 'crypto'
import mongoose from 'mongoose'
import { config } from './config/index.js'
import { LegalDocument } from './models/LegalDocument.js'
import { embed } from './services/embeddings.js'

interface LegalDocSeed {
  title: string
  content: string
  source: string
  category: 'act' | 'regulation' | 'guideline' | 'case_law' | 'procedure'
  year?: number
  section?: string
  tags: string[]
}

const SEED_DOCUMENTS: LegalDocSeed[] = [
  {
    title: 'Rent Act, 1963 (Act 220) — Overview',
    content: `The Rent Act, 1963 (Act 220) is the primary legislation governing rental housing in Ghana. It establishes the Rent Control Department and provides the legal framework for landlord-tenant relationships.

Key provisions:
- Establishes Rent Control Department with powers to investigate complaints
- Provides for rent tribunals to resolve disputes
- Regulates rent increases and advance payments
- Protects tenants from arbitrary eviction
- Requires landlords to maintain premises in habitable condition

The Act applies to all residential premises in Ghana except those specifically exempted by the Minister.`,
    source: 'Rent Act, 1963 (Act 220)',
    category: 'act',
    year: 1963,
    tags: ['rent control', 'landlord', 'tenant', 'eviction', 'habitability'],
  },
  {
    title: 'Rent Act Section 12 — Landlord Obligations',
    content: `Section 12 of the Rent Act, 1963 imposes specific obligations on landlords:

1. Maintenance of Premises: The landlord must keep the premises in a reasonable state of repair, having regard to their age, character, and locality.

2. Structural Repairs: The landlord is responsible for all structural repairs including roofing, external walls, drains, and gutters.

3. Common Areas: Where premises have common areas, the landlord must maintain them in a clean and safe condition.

4. No Self-Help Eviction: A landlord cannot evict a tenant by force, changing locks, disconnecting utilities, or removing the tenant's belongings without a court order.

5. Quiet Enjoyment: The tenant has the right to peaceful and undisturbed use of the premises.`,
    source: 'Rent Act, 1963 (Act 220)',
    category: 'act',
    year: 1963,
    section: '12',
    tags: ['landlord obligations', 'maintenance', 'repairs', 'quiet enjoyment', 'self-help eviction'],
  },
  {
    title: 'Rent Act Section 17-20 — Eviction Procedures',
    content: `Sections 17-20 of the Rent Act, 1963 govern legal eviction procedures in Ghana:

Section 17 — Notice Requirements:
- For monthly tenancies: at least one month's written notice
- For weekly tenancies: at least one week's written notice
- For yearly tenancies: at least six months' written notice

Section 18 — Grounds for Eviction:
- Non-payment of rent
- Subletting without consent
- Using premises for illegal purposes
- Causing damage beyond normal wear and tear
- Nuisance to neighbors

Section 19 — Court Order Required:
- No eviction is lawful without a court order
- Self-help evictions are criminal offenses
- Police assistance requires court authorization

Section 20 — Compensation:
- Wrongful eviction entitles tenant to compensation
- Tenant may recover damages for distress and inconvenience`,
    source: 'Rent Act, 1963 (Act 220)',
    category: 'act',
    year: 1963,
    section: '17-20',
    tags: ['eviction', 'notice period', 'court order', 'compensation', 'wrongful eviction'],
  },
  RECEIPT_LEGAL_DOCUMENT,
  {
    title: 'Rent Act Section 25 — Rent Advances and Increases',
    content: `Section 25 of the Rent Act, 1963 regulates rent advances and increases:

1. Maximum Advance (Section 25(5)): For a tenancy of more than six months, a landlord may not demand more than six months' rent in advance. For a monthly (or shorter) tenancy, the limit is one month's rent. Which limit applies depends on the length of the tenancy, not on the amount asked for.

2. Rent Increases: Rent cannot be increased arbitrarily during a fixed-term lease. For periodic tenancies, increases require:
   - Written notice
   - Reasonable justification
   - Approval by Rent Control Department (in some cases)

3. Security Deposits: Security deposits must be refundable at the end of tenancy, minus legitimate deductions for:
   - Unpaid rent
   - Damage beyond normal wear and tear
   - Cleaning costs (if premises left in poor condition)

4. Penalties: Demanding excessive advance or illegal rent increase attracts:
   - Fine up to 500 penalty units
   - Imprisonment up to 6 months
   - Or both`,
    source: 'Rent Act, 1963 (Act 220)',
    category: 'act',
    year: 1963,
    section: '25',
    tags: ['rent advance', 'rent increase', 'security deposit', '6 months', '1 month', 'monthly tenancy', 'penalty'],
  },
  {
    title: 'Rent Control Department — Filing a Complaint',
    content: `How to raise a complaint with the Rent Control Department in Ghana:

1. Visit your nearest Rent Control office. Check opening hours, fees and procedures with the office before you go.

2. Required Documents:
   - Tenancy agreement (if available)
   - Rent receipts
   - Photos of premises (for maintenance issues)
   - Written statement of complaint
   - Any correspondence with landlord

3. Process:
   - Submit your complaint
   - The Department investigates
   - It can arrange mediation between landlord and tenant
   - If mediation does not resolve the matter, it can go to the courts

How long a complaint takes varies by office and case; no timeline is guaranteed.`,
    source: 'Rent Control Department Guidelines',
    category: 'procedure',
    tags: ['complaint', 'rent control', 'mediation', 'tribunal', 'dispute resolution'],
  },
  {
    title: 'CHRAJ — Housing Rights Complaints',
    content: `The Commission on Human Rights and Administrative Justice (CHRAJ) handles housing rights complaints in Ghana:

Jurisdiction:
- Discrimination in housing (based on ethnicity, religion, gender, disability)
- Arbitrary administrative actions by housing authorities
- Violations of economic and social rights related to housing

Filing a Complaint:
1. Visit your nearest CHRAJ office
2. Complete a complaint form
3. Provide supporting evidence
4. CHRAJ investigates and makes recommendations

Powers:
- Recommend compensation
- Refer matters to court
- Make policy recommendations to government
- Publish findings`,
    source: 'CHRAJ Act, 1993 (Act 456)',
    category: 'procedure',
    year: 1993,
    tags: ['CHRAJ', 'human rights', 'discrimination', 'housing rights', 'complaint'],
  },
  {
    title: 'Ghana Constitution — Right to Property and Housing',
    content: `Article 18 and related provisions of the 1992 Constitution of Ghana protect property and housing rights:

Article 18 — Protection of Property:
- Every person has the right to own property
- No property shall be compulsorily taken without fair and adequate compensation
- Property rights include the right to peaceful possession

Article 24 — Economic Rights:
- Every person has the right to work under satisfactory, safe, and healthy conditions
- This includes the right to housing that meets basic health and safety standards

Article 15 — Respect for Human Dignity:
- No person shall be subjected to torture or cruel, inhuman, or degrading treatment
- This includes being deprived of basic shelter or being forcibly evicted without due process

These constitutional provisions underpin all rental housing laws in Ghana.`,
    source: '1992 Constitution of Ghana',
    category: 'act',
    year: 1992,
    tags: ['constitution', 'property rights', 'human dignity', 'housing', 'compensation'],
  },
  {
    title: 'Tenant Rights — Quick Reference',
    content: `Key rights every tenant in Ghana should know:

1. Right to Receipt: You are entitled to a written receipt for every rent payment.

2. Right to Quiet Enjoyment: Your landlord cannot disturb your peaceful use of the property.

3. Right to Notice: You cannot be evicted without proper written notice and a court order.

4. Right to Habitable Premises: Your landlord must maintain the property in a livable condition.

5. Right to Fair Rent: Rent increases must be reasonable and follow legal procedures.

6. Right to Refund of Deposit: Your security deposit must be returned, minus legitimate deductions.

7. Right to Privacy: Your landlord must give reasonable notice before entering your home.

8. Right to Complain: You can raise complaints with the Rent Control Department.

What to do if rights are violated:
- Document everything (photos, messages, receipts)
- File a complaint with Rent Control
- Contact CHRAJ if discrimination is involved
- Consult a lawyer for serious cases`,
    source: 'RentOS Legal Assistant Knowledge Base',
    category: 'guideline',
    tags: ['tenant rights', 'quick reference', 'receipt', 'eviction', 'deposit', 'privacy'],
  },
  {
    title: 'Landlord Rights and Responsibilities',
    content: `Key rights and responsibilities of landlords in Ghana:

Landlord Rights:
1. Right to Receive Rent: Timely payment as agreed in the tenancy agreement.
2. Right to inspect: With reasonable notice.
3. Right to evict: Through legal process only, for valid reasons.
4. Right to compensation: For damage beyond normal wear and tear.
5. Right to terminate: With proper notice according to tenancy terms.

Landlord Responsibilities:
1. Maintain premises in habitable condition.
2. Carry out structural repairs promptly.
3. Provide rent receipts for all payments.
4. Respect tenant's right to quiet enjoyment.
5. Return security deposit with deductions documented.
6. Not demand more rent in advance than Section 25(5) allows: six months' rent for a tenancy of more than six months, one month's rent for a monthly tenancy.
7. Not increase rent arbitrarily during fixed-term leases.
8. Not disconnect utilities or use self-help eviction.

Best Practices:
- Use written tenancy agreements
- Conduct entry/exit inspections
- Keep records of all communications
- Respond to maintenance requests within reasonable time`,
    source: 'RentOS Legal Assistant Knowledge Base',
    category: 'guideline',
    tags: ['landlord rights', 'landlord responsibilities', 'maintenance', 'eviction', 'best practices'],
  },
]

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * SHA-256 of the content earlier bootstraps planted for documents whose
 * wording has since been corrected: a flat six-month advance cap with no
 * one-month rule for monthly tenancies, unverified phone numbers, an office
 * address and complaint timelines, "free" services and a 24-48 hour inspection
 * notice. A stored copy is replaced only while it still hashes to this value,
 * so a reviewer's edits are never overwritten.
 */
const SUPERSEDED_CONTENT: Record<string, string> = {
  'Rent Act Section 25 — Rent Advances and Increases': '81dcf78beb6e7e49aa0fcbb839ed3c97a79ad3562ef770694e1395025fa753ca',
  'Rent Control Department — Filing a Complaint': 'f0bc84d271797dbd14f9daed14ae20c97a812829834a581d7e369aaad14f1495',
  'CHRAJ — Housing Rights Complaints': '928fbeba1b1cedc7ecb31a155de0c993d0964959ad2f8b0a256e843ff060415f',
  'Tenant Rights — Quick Reference': '0ca8f581d03277aa1c8c9a67fa54834c95a462a9cd3944a62622431c190ee7a8',
  'Landlord Rights and Responsibilities': '2b40ce451d377e9b70ee5fb10ee54fa7749f06f0cad67eeefcef4f1d538613d4',
}

async function run() {
  await mongoose.connect(config.mongoUri)
  console.log('Connected to MongoDB.')
  const corrected = await correctLegacyReceiptDocuments()
  console.log(`Corrected legacy receipt documents: ${corrected.modifiedCount}`)

  let created = 0
  let superseded = 0
  let skipped = 0

  for (const seed of SEED_DOCUMENTS) {
    const existing = await LegalDocument.findOne({ title: seed.title, source: seed.source })
    if (existing) {
      if (existing.content !== seed.content && SUPERSEDED_CONTENT[seed.title] === sha256(existing.content)) {
        // Old vectors describe the old text; re-embed so search finds the correction.
        const { embedding } = await embed(seed.content)
        await LegalDocument.updateOne({ _id: existing._id }, { $set: { content: seed.content, tags: seed.tags, embedding } })
        superseded++
        console.log(`Corrected: ${seed.title}`)
        continue
      }
      skipped++
      continue
    }

    const { embedding } = await embed(seed.content)
    await LegalDocument.create({ ...seed, embedding, isActive: true })
    created++
    console.log(`Created: ${seed.title}`)
  }

  console.log(`\nBootstrap complete. Created: ${created}, Corrected: ${superseded}, Skipped: ${skipped}`)
  process.exit(0)
}

run().catch((err) => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
