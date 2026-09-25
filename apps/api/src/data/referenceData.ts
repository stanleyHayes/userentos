/**
 * Platform reference data — the content every RentOS database needs regardless
 * of who is using it: subscription plans, Ghana rental-law articles, and the
 * educational blog.
 *
 * Both seeds read from here. The demo seed (models/seed.ts) plants it alongside
 * fake accounts and listings; the production seed (seedProduction.ts) plants
 * only the items marked `reviewed` (see ReviewMeta below), so a live database
 * gets checked law summaries without the fake data.
 *
 * Legal articles must agree with services/legal/rentLaw.ts — the statutory
 * thresholds and citations the compliance checker uses. No invented section
 * numbers, deadlines, amendments, statistics or financial promotions.
 */

/**
 * Plan benefits list only what the code enforces (the property limit — see
 * services/entitlements.ts) plus email support. Earlier copies promised API
 * access, bulk operations, advanced analytics, featured listings, priority
 * support and a dedicated account manager, none of which exist. Add a benefit
 * here only once it is delivered.
 */
export const SUBSCRIPTION_PACKAGES = [
    {
      name: 'Starter',
      slug: 'starter',
      description: 'Perfect for individual landlords just getting started',
      price: 0,
      billingCycle: 'monthly',
      maxProperties: 3,
      benefits: ['List up to 3 properties', 'Email support'],
      isActive: true,
      isDefault: true,
      sortOrder: 0,
    },
    {
      name: 'Professional',
      slug: 'professional',
      description: 'For growing landlords managing multiple properties',
      price: 50,
      billingCycle: 'monthly',
      maxProperties: 10,
      benefits: ['List up to 10 properties', 'Email support'],
      isActive: true,
      isDefault: false,
      sortOrder: 1,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Unlimited properties for property management companies',
      price: 150,
      billingCycle: 'monthly',
      maxProperties: -1,
      benefits: ['Unlimited properties', 'Email support'],
      isActive: true,
      isDefault: false,
      sortOrder: 2,
    },
]

/**
 * Review status of seeded content.
 *
 * `reviewed: true` means every factual statement in the item is traceable to
 * the team-reviewed legal corpus — services/legal/rentLaw.ts (statutory
 * thresholds and citations) and bootstrapLegalDocs.ts — or, for product
 * guides, to how the code actually behaves. It is a consistency check, not
 * legal sign-off: have a Ghanaian lawyer review the legal articles before
 * launch.
 *
 * Only reviewed items are seeded into production (seedProduction.ts). Add new
 * articles with `reviewed: false`; they reach the demo seed only until someone
 * checks them and flips the flag.
 */
export interface ReviewMeta {
  reviewed: boolean
}

const NOT_ADVICE = '\n\nThis summary is general information, not legal advice.'

export const LEGAL_ARTICLES = [
    { reviewed: true, title: 'Rent Act, 1963 (Act 220)', content: 'The Rent Act, 1963 (Act 220) is the main law on residential tenancies in Ghana. It established the Rent Control Department, which investigates complaints, and provides the framework for landlord–tenant relationships.\n\nAmong other things, the Act:\n\n1. Limits how much rent a landlord may demand in advance (Section 25)\n2. Requires landlords to keep premises in a reasonable state of repair (Section 12)\n3. Sets notice requirements and requires a court order for eviction (Sections 17–20)\n4. Entitles tenants to a receipt for rent paid (Section 33)\n\nThe Act applies to residential premises in Ghana except those exempted by the Minister.' + NOT_ADVICE, simplifiedContent: 'This is Ghana\'s main rent law. It limits rent advance, requires landlords to keep homes in repair, requires proper notice and a court order before an eviction, and gives you the right to a receipt for rent you pay.', category: 'Rent Control Act', lawReference: 'Act 220', effectiveDate: '1963-01-01', tags: ['rent control', 'tenant protection', 'landlord regulation'], language: 'en' },
    { reviewed: true, title: 'Rent Advance Limits', content: 'Section 25(5) of the Rent Act, 1963 (Act 220) limits rent advance:\n\n- For a tenancy of more than six months, a landlord may not demand more than six months\' rent in advance.\n- For a monthly (or shorter) tenancy, the limit is one month\'s rent.\n\nWhich limit applies depends on the length of the tenancy, not on the amount asked for. If you believe you have been asked for more than the law allows, you can raise it with the Rent Control Department.' + NOT_ADVICE, simplifiedContent: 'For a tenancy longer than six months, your landlord cannot demand more than six months\' rent in advance. For a monthly tenancy, the limit is one month. You can report a demand above the limit to the Rent Control Department.', category: 'Rent Advance Limits', lawReference: 'Rent Act, 1963 (Act 220), Section 25(5)', effectiveDate: '1963-01-01', tags: ['rent advance', 'tenant rights', 'payment'], language: 'en' },
    { reviewed: true, title: 'Tenant Eviction Process', content: 'Sections 17–20 of the Rent Act, 1963 (Act 220) govern eviction:\n\n- Notice: the landlord must give written notice — at least one week for a weekly tenancy and at least one month for a monthly tenancy. Longer tenancies need longer notice; check the Act or get advice for your situation.\n- Grounds: recognised grounds include non-payment of rent, subletting without consent, using the premises for illegal purposes, damage beyond normal wear and tear, and nuisance to neighbours.\n- Court order: no eviction is lawful without a court order. Self-help eviction — changing locks, cutting off utilities or removing belongings — is unlawful.\n- Compensation: a tenant who is wrongfully evicted may be entitled to compensation.' + NOT_ADVICE, simplifiedContent: 'Your landlord must give you written notice (one month for a monthly tenancy) and get a court order before you can be evicted. Changing your locks or cutting your utilities to force you out is unlawful.', category: 'Eviction Laws', lawReference: 'Rent Act, 1963 (Act 220), Sections 17-20', effectiveDate: '1963-01-01', tags: ['eviction', 'notice period', 'tenant rights'], language: 'en' },
    { reviewed: true, title: 'Landlord Maintenance Obligations', content: 'Section 12 of the Rent Act, 1963 (Act 220) requires a landlord to keep the premises in a reasonable state of repair, having regard to their age, character and locality. This includes structural repairs — the roof, external walls, drains and gutters — and keeping any common areas clean and safe. The tenant is entitled to quiet enjoyment: peaceful, undisturbed use of the home.\n\nAs a tenant, report repairs promptly and in writing, keep the premises clean, and do not make alterations without permission. If repairs are not done, keep records and raise it with the Rent Control Department.' + NOT_ADVICE, simplifiedContent: 'Your landlord must keep the building in reasonable repair, including the roof, walls, drains and shared areas. Report problems in writing and keep records.', category: 'Landlord Obligations', lawReference: 'Rent Act, 1963 (Act 220), Section 12', effectiveDate: '1963-01-01', tags: ['maintenance', 'landlord duties', 'repairs'], language: 'en' },
    { reviewed: true, title: 'Security Deposit Rules in Ghana', content: 'Under Section 25 of the Rent Act, 1963 (Act 220), a security deposit must be refundable at the end of the tenancy, less legitimate deductions — for example unpaid rent, damage beyond normal wear and tear, or cleaning costs if the premises are left in poor condition.\n\nPractical steps:\n\n- Get a receipt for the deposit\n- Record the condition of the property at move-in (photos or video)\n- Do a joint inspection at move-out\n- Ask for any deductions to be itemised, and request the refund in writing\n- If you cannot agree, raise it with the Rent Control Department or file a dispute on RentOS' + NOT_ADVICE, simplifiedContent: 'Your deposit should be returned when the tenancy ends, minus legitimate deductions such as unpaid rent or damage. Take photos at move-in and move-out, and ask for any deductions in writing.', category: 'Tenant Rights', lawReference: 'Rent Act, 1963 (Act 220), Section 25', effectiveDate: '1963-01-01', tags: ['security deposit', 'tenant rights', 'move-out'], language: 'en' },
    { reviewed: true, title: 'Dispute Resolution Mechanisms', content: 'Ways to resolve a rental dispute in Ghana:\n\n1. Direct negotiation: try to resolve the issue with the other party first, in writing where possible.\n2. Rent Control Department: investigates complaints and can arrange mediation. Bring your tenancy agreement, rent receipts, photos and any correspondence.\n3. The courts: where mediation does not resolve the matter.\n4. RentOS: file a dispute to keep a record, notify the other party and, where available, get mediation support.\n\nCommon disputes include rent increases, repairs, deposit refunds, eviction notices and utility disconnection. Keep records of every payment and message.' + NOT_ADVICE, simplifiedContent: 'If you have a problem with your landlord or tenant, first try to settle it in writing. If that fails, the Rent Control Department can investigate and mediate. You can also file a dispute on RentOS.', category: 'Dispute Resolution', lawReference: 'Rent Act, 1963 (Act 220)', effectiveDate: '1963-01-01', tags: ['disputes', 'mediation', 'rent control', 'resolution'], language: 'en' },
    { reviewed: true, title: 'Rights of Subletting', content: 'Subletting without the landlord\'s consent is one of the grounds for eviction under Sections 17–20 of the Rent Act, 1963 (Act 220).\n\nBefore you sublet:\n\n- Check your tenancy agreement — some prohibit subletting outright\n- Get your landlord\'s consent in writing\n- Put the arrangement with your sub-tenant in writing\n- Remember that your own agreement with the landlord still applies to you, including rent and the condition of the property' + NOT_ADVICE, simplifiedContent: 'Get your landlord\'s written permission before you sublet. Subletting without consent can be a reason for eviction.', category: 'Tenant Rights', lawReference: 'Rent Act, 1963 (Act 220), Sections 17-20', effectiveDate: '1963-01-01', tags: ['subletting', 'tenant rights', 'agreement'], language: 'en' },
    { reviewed: true, title: 'Property Inspection Rights', content: 'A tenant is entitled to quiet enjoyment — peaceful, undisturbed use of the premises (Rent Act, 1963 (Act 220), Section 12). In practice, your landlord should give reasonable notice and agree a reasonable time before entering, except in an emergency.\n\nTips:\n\n- Agree the notice period for inspections in your tenancy agreement\n- Inspect the property before signing and record its condition at move-in\n- Ask to be present during inspections\n- Put repair requests identified during an inspection in writing' + NOT_ADVICE, simplifiedContent: 'You have the right to peaceful use of your home. Your landlord should give reasonable notice before coming to inspect, except in an emergency. Agree the notice period in your tenancy agreement.', category: 'Landlord Obligations', lawReference: 'Rent Act, 1963 (Act 220), Section 12', effectiveDate: '1963-01-01', tags: ['inspection', 'privacy', 'landlord access'], language: 'en' },
]

export const BLOG_POSTS = [
    { reviewed: true, title: 'Understanding the Rent Advance Limit in Ghana', slug: 'rent-advance-cap', coverImage: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800', excerpt: 'What the Rent Act says about how much rent advance a landlord may demand.', content: '## What Does the Law Say?\n\nSection 25(5) of the **Rent Act, 1963 (Act 220)** limits rent advance:\n\n- For a tenancy of **more than six months**, a landlord may not demand more than **six months\'** rent in advance.\n- For a **monthly** (or shorter) tenancy, the limit is **one month\'s** rent.\n\nWhich limit applies depends on the length of the tenancy, not on the amount asked for.\n\n## What to Do if Your Landlord Asks for More\n\n1. **Talk to your landlord** and refer to the law\n2. **Raise a complaint** with the Rent Control Department\n3. **File a dispute on RentOS** to keep a record and notify the other party\n\n> RentOS flags agreements whose advance exceeds these limits before anyone signs. The flag is information, not legal advice.', author: 'RentOS Team', tags: ['tenant rights', 'rent advance', 'legal guide'], published: true },
    { reviewed: true, title: 'How to Save for Rent Using RentGuard', slug: 'rentguard-savings-guide', coverImage: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800', excerpt: 'A step-by-step guide to using RentGuard savings plans to plan for your next rent payment.', content: '## What Is RentGuard?\n\n**RentGuard** is the savings feature in RentOS. It helps you set money aside gradually for rent instead of finding a large lump sum at once.\n\n## Getting Started\n\n### Step 1: Create a Savings Plan\n\nGo to **RentGuard** and choose **New Savings Plan**. Set:\n- Your target amount\n- How often you contribute (daily, weekly or monthly)\n- Your target date\n\n### Step 2: Add Money to Your Wallet\n\nTop up your RentOS wallet with mobile money (MTN MoMo, Telecel Cash or AirtelTigo Money) using the payment options shown in the app.\n\n### Step 3: Turn On Auto-Debit (Optional)\n\nWith **auto-debit** on, RentOS moves your contribution from your **RentOS wallet** into your plan on schedule. If your wallet balance is too low, the contribution is skipped and you are notified.\n\n### Step 4: Track Progress\n\nYour plan shows how close you are to your target, and you are notified when you reach it.\n\n> **Tip:** Start saving soon after your last rent payment — small, regular contributions add up.\n\nYour wallet and savings plans are records of money you paid in. They are not bank deposits.', author: 'RentOS Team', tags: ['savings', 'rentguard', 'guide'], published: true },
    { reviewed: true, title: '5 Things Every Tenant Should Know Before Signing a Lease', slug: 'tenant-lease-checklist', coverImage: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800', excerpt: 'Essential things to check in your rental agreement before you sign.', content: '## Before You Sign\n\nA tenancy agreement is a serious commitment. Check these five things first.\n\n### 1. Rent Advance\n\nUnder Section 25(5) of the Rent Act, 1963 (Act 220), a landlord may not demand more than **six months\'** advance for a tenancy longer than six months, or more than **one month\'s** for a monthly tenancy.\n\n### 2. Notice Period\n\nCheck the notice each party must give to end the tenancy.\n\n### 3. Repairs\n\nThe Rent Act requires landlords to keep the premises in a reasonable state of repair. The agreement should say who handles which repairs.\n\n### 4. Utilities\n\nWho pays for water, electricity and internet? Get it in writing.\n\n### 5. Disputes\n\nDoes the agreement say how disputes will be handled?\n\n> **Bottom line:** Take time to read the whole agreement. RentOS flags some terms that may breach rental law, but the checks are automated and incomplete — they are not legal advice.', author: 'RentOS Team', tags: ['tenant rights', 'agreements', 'tips'], published: true },
    { reviewed: true, title: "A Landlord's Guide to Digital Rental Agreements", slug: 'landlord-digital-agreements', coverImage: 'https://images.unsplash.com/photo-1554224154-22dec7ec8818?w=800', excerpt: 'What digital agreements on RentOS do, and how to create one.', content: '## Why Go Digital?\n\n- **Automated checks** flag some terms that may breach rental law, such as rent advance above the legal limit, before anyone signs\n- **Electronic signatures** — electronic signatures and records are recognised under the Electronic Transactions Act, 2008 (Act 772); whether a particular agreement is enforceable still depends on its terms and the law\n- Both parties can **open the agreement at any time**\n- A clear record helps if a **dispute** arises\n\n## How to Create One on RentOS\n\n1. Go to **Agreements > New Agreement**\n2. Select the property and the tenant\n3. Set the rent amount, duration and advance\n4. Add your terms\n5. Review any **compliance flags**\n6. Send to the tenant for signature\n\n> The compliance checks are information, not legal advice. For anything unusual, speak to a lawyer.', author: 'RentOS Team', tags: ['landlord guide', 'agreements', 'digital'], published: true },
    { reviewed: true, title: 'How Your Rental Credit Score Works on RentOS', slug: 'rental-credit-score', coverImage: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800', excerpt: 'The factors that make up your RentOS credit score and how to improve it.', content: '## What Is Your Rental Credit Score?\n\nYour RentOS credit score is a **0–100 rating** calculated from your activity on RentOS. Landlords you apply to can see it.\n\n## Score Breakdown\n\n| Factor | Max Points | What It Measures |\n|---|---|---|\n| Payment History | **40** | Completed rent payments on RentOS |\n| Savings Consistency | **20** | RentGuard savings progress |\n| Agreement Compliance | **20** | An active agreement with no compliance flags |\n| Dispute Record | **10** | Open or escalated disputes lower it |\n| Account Age | **10** | How long you have had your account |\n\n## Tips to Improve Your Score\n\n- **Pay rent through RentOS** — payment history is worth the most points\n- **Save regularly** with RentGuard, even small amounts\n- **Resolve disputes** through mediation\n\n> The score only reflects what happens on RentOS. If you think it is wrong, contact support and ask for a person to review it.', author: 'RentOS Team', tags: ['credit score', 'tenant guide'], published: true },
    { reviewed: true, title: 'Navigating Rent Disputes in Ghana: A Practical Guide', slug: 'rent-dispute-guide', coverImage: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800', excerpt: 'Step-by-step guide to handling common rental disputes in Ghana.', content: '## Disputes Happen — Here Is How to Handle Them\n\n## Step 1: Document Everything\n\nKeep records of **all messages, payments and agreements**. Take photos of any damage or repair issues.\n\n## Step 2: Communicate in Writing\n\nFollow up conversations in writing — text, email or RentOS messages.\n\n## Step 3: File a Dispute on RentOS\n\nRentOS records your complaint and notifies the other party. Where available, a mediator can help.\n\n## Step 4: Rent Control Department\n\nIf you cannot agree, the Rent Control Department investigates complaints and can arrange mediation. Bring your agreement, receipts, photos and correspondence.\n\n## Step 5: The Courts\n\nIf mediation fails, the matter can go to court. Consider getting legal advice.\n\n> This guide is general information, not legal advice.', author: 'RentOS Team', tags: ['disputes', 'legal guide', 'tenant rights'], published: true },
    { reviewed: true, title: 'A Guide to the Rent Control Department', slug: 'ghana-rent-control-guide', coverImage: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800', excerpt: 'What the Rent Control Department does and how to raise a complaint.', content: '## What Is the Rent Control Department?\n\nThe Rent Control Department was established under the **Rent Act, 1963 (Act 220)**. It investigates complaints about residential tenancies and can arrange mediation between landlords and tenants.\n\n## Raising a Complaint\n\nVisit your nearest Rent Control office and bring:\n\n- Your tenancy agreement (if you have one)\n- Rent receipts\n- Photos of the premises, for repair issues\n- A written statement of your complaint\n- Any messages or letters with the other party\n\nCheck opening hours, fees and procedures with the office before you go.\n\n> This guide is general information, not legal advice.', author: 'RentOS Team', tags: ['rent control', 'legal guide'], published: true },
    { reviewed: true, title: 'Mobile Money and Rent Payments: A Modern Guide', slug: 'mobile-money-rent-payments', coverImage: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800', excerpt: 'How to pay rent with MTN MoMo, Telecel Cash and AirtelTigo Money on RentOS.', content: '## Paying Rent with Mobile Money\n\nRentOS accepts rent payments by mobile money through our payment provider.\n\n## Supported Wallets\n\n- **MTN Mobile Money (MoMo)**\n- **Telecel Cash**\n- **AirtelTigo Money**\n\nBank transfer is also offered where it is available in the app.\n\n## Security Tips\n\n- Never share your mobile money PIN — RentOS will never ask for it\n- Pay through RentOS so you get a receipt for every payment\n- Turn on transaction notifications on your phone\n\n> Completed rent payments through RentOS count towards your rental credit score.', author: 'RentOS Team', tags: ['payments', 'mobile money', 'guide'], published: true },
]

/** Items fit for a production database — see ReviewMeta. The flag is stripped. */
export function reviewedOnly<T extends ReviewMeta>(items: readonly T[]): Omit<T, 'reviewed'>[] {
  return items.filter((item) => item.reviewed).map(({ reviewed: _reviewed, ...rest }) => rest)
}

/**
 * SHA-256 of the `content` of reference items as earlier production seeds
 * planted them. The production seed replaces (or, for retracted items,
 * withdraws) a stored copy only while its content still hashes to one of
 * these — i.e. nobody has edited it since — so corrections reach live
 * databases without overwriting an editor's changes.
 */
export const SUPERSEDED_SEED_CONTENT = {
  legalArticles: {
    'Rent Act, 1963 (Act 220)': '8716b1a58f48057bf1de98cfe6eca39a630a46ff60a9b4a5c4cea0156fd062da',
    'Rent Advance Limits': '48e34c7119984fba11210c44b70ff024f1d79f3c6f9ce9764a571829206efcc6',
    'Tenant Eviction Process': '3ddb4c0646c1fd974b1eb2394834c6aa69771ec5201035092ed984040600a394',
    'Landlord Maintenance Obligations': '8e23708d2eb796ba88b142a4d2d6790992c633ab59597bc798c0802f5a303fef',
    'Security Deposit Rules in Ghana': '7096962c015e1340a2af2dd22e5588b70a23d5aecef250a83acb61f3e33f0ae6',
    'Dispute Resolution Mechanisms': 'b5caa4b93ab8a7b2a1c9bfdc838d9b4671a5cbf79b1f8ad2f58abe163b1555f8',
    'Rights of Subletting': 'e2aeb51ba96174e295a6ca27369d33221934c837a184ceb8e1ab49183f814509',
    'Property Inspection Rights': 'c36f51fdd1f779cf51ef5fdeeefaa2cc4eedfcbee8c1ce4b3606eeb1bc84be34',
  } as Record<string, string>,
  blogPosts: {
    'rent-advance-cap': '327073c0f061177e5fa76d71f3d4f3ffa6f8ca1e669ae97101668f85a4254d8d',
    'rentguard-savings-guide': '6a84c3f374eb1bf152db98337c66b1e8d20c1ab035c20183dd5ed166040a5038',
    'tenant-lease-checklist': '05bf95383f80d720dc939b4fbb363535b0b9cfce6faa33c4d206a91dbf410b03',
    'landlord-digital-agreements': 'e42c60c446a734817f5643946c418f09adcd088b2b9f4602491473211f336d8e',
    'rental-credit-score': 'cc546b78d8f89ed3f5d0aaad95c1618dbc312814e0d480eaa3414df58b184d19',
    'rent-dispute-guide': '8d6e583ca3858a53c19fd34bf6a70a1f0809249eeccc5e7f2236b4b5638cd89c',
    // Retracted: promoted investments with invented T-bill/bond rates and
    // loans with invented terms — financial promotions, not education.
    'investing-rent-savings': '72f75b208a4eb04d48c47fc680d21d6ebcdc29acf4da619ee7f1b3aa80198d2e',
    'micro-loans-rent-gap': '8e909cfb81c78e5ca40a49066e5b5979011ef0e40cb3a082c6a61b026ad34ac1',
    'ghana-rent-control-guide': '0dd367daec161e5c5bf65006e0ed7ebb8a6931947d633bab9b8729229d2563c9',
    'mobile-money-rent-payments': 'f84c9093dd5bb4ff964967129ebeae9c7410d3a8414b7237dbae3bdd9aa3ab32',
  } as Record<string, string>,
}
