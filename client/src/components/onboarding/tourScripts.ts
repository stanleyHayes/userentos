/**
 * Per-role onboarding scripts — narrated by Ama.
 *
 * VOICE GUIDE
 * -----------
 * Ama's tone: friendly, warm, locally relatable. Think a helpful banker, not
 * an American startup-speak chatbot. Plain English (no slang). Encouraging
 * but never patronising. Short sentences. A small Ghanaian touch is fine
 * ("Akwaaba", "let me show you around"), but never forced.
 *
 * RECOMMENDED `data-tour` ATTRIBUTES (FOLLOW-UP WORK)
 * ---------------------------------------------------
 * The tour will gracefully centre its card if a target selector isn't found,
 * so adding these attributes is incremental, non-blocking work. A single
 * sweep adding the following hooks will light up spotlights everywhere:
 *
 *   Layout (DashboardLayout / Sidebar / Header)
 *     [data-tour="sidebar"]               -> the main sidebar nav element
 *     [data-tour="role-switcher"]         -> active-role chip in Header
 *     [data-tour="notifications"]         -> bell icon in Header
 *     [data-tour="profile-menu"]          -> avatar / settings dropdown in Header
 *
 *   Dashboard pages (any role)
 *     [data-tour="dashboard-stats"]       -> top KPI cards row
 *     [data-tour="dashboard-actions"]     -> primary CTA cluster on dashboard
 *
 *   Tenant
 *     [data-tour="tenant-search"]         -> property search input on /properties
 *     [data-tour="tenant-favorites"]      -> favorites tab/button
 *     [data-tour="tenant-applications"]   -> "My Applications" nav item or page
 *     [data-tour="tenant-agreements"]     -> agreements list on /agreements
 *     [data-tour="tenant-payments"]       -> payments / pay-rent CTA
 *     [data-tour="tenant-credit"]         -> credit / RentScore widget
 *
 *   Landlord / Property Manager
 *     [data-tour="add-property"]          -> "Add property" button
 *     [data-tour="properties-list"]       -> portfolio table/grid
 *     [data-tour="tenants-list"]          -> tenants nav item or page
 *     [data-tour="agreements-list"]       -> agreements area
 *     [data-tour="payments-overview"]     -> payments dashboard card
 *     [data-tour="disputes-inbox"]        -> disputes inbox link
 *
 *   Government
 *     [data-tour="gov-properties-review"] -> review queue
 *     [data-tour="gov-policy-sim"]        -> policy simulation entry point
 *     [data-tour="gov-oversight"]         -> oversight / market-health view
 *
 *   Legal Officer
 *     [data-tour="legal-laws"]            -> rental laws library
 *     [data-tour="legal-ai"]              -> AI legal assistant
 *     [data-tour="legal-disputes"]        -> dispute mediation queue
 *
 *   Financier
 *     [data-tour="fin-applications"]      -> incoming applications queue
 *     [data-tour="fin-mandates"]          -> mandates / portfolio
 *     [data-tour="fin-funding"]           -> agreement funding action
 *
 *   Employer
 *     [data-tour="emp-staff"]             -> staff verification list
 *     [data-tour="emp-obligations"]       -> staff rent obligations dashboard
 *
 *   Admin / Super Admin
 *     [data-tour="admin-users"]           -> user management
 *     [data-tour="admin-audit"]           -> audit log
 *     [data-tour="admin-settings"]        -> platform settings
 */

import type { UserRole } from '@/types'

export interface TourStep {
  /** Headline shown in the speech bubble. */
  title: string
  /** Body copy — keep to ~2 short sentences. */
  body: string
  /**
   * Optional CSS selector for a spotlight target. If the element isn't found,
   * the card centres itself — so missing selectors degrade gracefully.
   */
  target?: string
  /**
   * Optional Ama expression for this step. Defaults to 'happy', except for
   * steps with a target (which feel more natural with 'pointing').
   */
  expression?: 'happy' | 'pointing'
}

export type TourScript = TourStep[]

const tenant: TourScript = [
  {
    title: 'Akwaaba — welcome to RentOS',
    body:
      "I'm Ama, and I'll show you around in less than a minute. RentOS is your home for finding a place, signing your lease, and paying rent — all in one trusted spot.",
  },
  {
    title: 'Find a place that fits',
    body:
      'Browse verified homes across Ghana, filter by location and budget, and view the full details before you visit. Every property is checked, so you can search with confidence.',
    target: '[data-tour="tenant-search"]',
    expression: 'pointing',
  },
  {
    title: 'Save your shortlist',
    body:
      "Tap the heart on any property to keep it in your favourites. Your shortlist follows you across devices, so you don't lose track of the home you liked yesterday.",
    target: '[data-tour="tenant-favorites"]',
    expression: 'pointing',
  },
  {
    title: 'Apply with one profile',
    body:
      'When you find a place you love, apply directly. Your verified profile and Ghana Card are shared securely with the landlord — no more endless paperwork.',
    target: '[data-tour="tenant-applications"]',
    expression: 'pointing',
  },
  {
    title: 'Sign your agreement online',
    body:
      "Approved? Your tenancy agreement is generated and signed inside RentOS. You'll get a copy by email and a permanent record here.",
    target: '[data-tour="tenant-agreements"]',
    expression: 'pointing',
  },
  {
    title: 'Pay rent, build your record',
    body:
      'Pay every month with mobile money or card. Each on-time payment improves your RentScore — your portable history that helps you secure better homes and finance later.',
    target: '[data-tour="tenant-payments"]',
    expression: 'pointing',
  },
]

const landlord: TourScript = [
  {
    title: 'Welcome — let me show you the basics',
    body:
      "I'm Ama. RentOS gives you one clean place to manage your properties, tenants, and rent collection. Let me walk you through the essentials.",
  },
  {
    title: 'Add your first property',
    body:
      'List a property in a few minutes. Photos, location, rent, and lease terms are all you need to start receiving applications from verified tenants.',
    target: '[data-tour="add-property"]',
    expression: 'pointing',
  },
  {
    title: 'Review tenants the smart way',
    body:
      'Every applicant comes with a verified Ghana Card and a rental history. Approve, decline, or request more details — all in one view.',
    target: '[data-tour="tenants-list"]',
    expression: 'pointing',
  },
  {
    title: 'Agreements, signed digitally',
    body:
      'When you accept a tenant, RentOS generates the lease and routes it for signing. You get a binding copy in your dashboard — no printing, no chasing.',
    target: '[data-tour="agreements-list"]',
    expression: 'pointing',
  },
  {
    title: 'Track payments and disputes',
    body:
      "See who's paid, who's late, and resolve issues with a clear paper trail. If a dispute escalates, our legal partners are right inside the app.",
    target: '[data-tour="payments-overview"]',
    expression: 'pointing',
  },
]

const property_manager: TourScript = [
  {
    title: 'Welcome to your management workspace',
    body:
      "I'm Ama. As a manager, you handle properties on behalf of owners — RentOS keeps every portfolio organised and every owner in the loop.",
  },
  {
    title: 'Onboard a property',
    body:
      'Add properties under each owner you represent. Owners get clear visibility, and you keep one tidy dashboard across the whole portfolio.',
    target: '[data-tour="add-property"]',
    expression: 'pointing',
  },
  {
    title: 'Tenants in one place',
    body:
      'Review applications, approve qualified tenants, and message them directly. Your owners see only what they need to see.',
    target: '[data-tour="tenants-list"]',
    expression: 'pointing',
  },
  {
    title: 'Lease and renewal tracking',
    body:
      'RentOS flags upcoming renewals and expiries before they catch you off guard, so you can keep occupancy steady.',
    target: '[data-tour="agreements-list"]',
    expression: 'pointing',
  },
  {
    title: 'Payments, statements, oversight',
    body:
      "Collect rent, generate statements, and resolve disputes — all auditable. When the owner asks 'how are things?', the answer is one click away.",
    target: '[data-tour="payments-overview"]',
    expression: 'pointing',
  },
]

const government: TourScript = [
  {
    title: 'Welcome to the oversight portal',
    body:
      "I'm Ama. This portal gives your team a clear, real-time view of the rental market across Ghana — no spreadsheets needed.",
  },
  {
    title: 'Review properties for compliance',
    body:
      'Review submitted listings against rent control and registration rules. Approve, query, or escalate — every decision is logged.',
    target: '[data-tour="gov-properties-review"]',
    expression: 'pointing',
  },
  {
    title: 'Run policy simulations',
    body:
      'Model the impact of a policy change on real (anonymised) market data before you announce it. See the numbers before they affect families.',
    target: '[data-tour="gov-policy-sim"]',
    expression: 'pointing',
  },
  {
    title: 'Monitor market health',
    body:
      "Spot trends in pricing, vacancy, and disputes by region. You'll see issues forming before they become headlines.",
    target: '[data-tour="gov-oversight"]',
    expression: 'pointing',
  },
]

const legal_officer: TourScript = [
  {
    title: 'Welcome — your legal workspace',
    body:
      "I'm Ama. RentOS gives you the rental laws, AI assistance, and dispute tools you need in one focused workspace.",
  },
  {
    title: 'Rental law, always at hand',
    body:
      "Every relevant Ghanaian rental statute and precedent is searchable here. You'll cite chapter and verse without leaving the app.",
    target: '[data-tour="legal-laws"]',
    expression: 'pointing',
  },
  {
    title: 'Mediate disputes faster',
    body:
      'Open cases come into your queue with full agreement and payment history attached. Use the AI assistant to draft positions and recommendations.',
    target: '[data-tour="legal-disputes"]',
    expression: 'pointing',
  },
]

const financier: TourScript = [
  {
    title: 'Welcome to your financing dashboard',
    body:
      "I'm Ama. From here you'll review tenant applications for rent finance, manage your mandates, and fund agreements — all in one place.",
  },
  {
    title: 'Review applications',
    body:
      'Each applicant comes with verified identity, employer verification, and a RentScore. Approve, counter, or decline with full context.',
    target: '[data-tour="fin-applications"]',
    expression: 'pointing',
  },
  {
    title: 'Manage your mandates',
    body:
      "Set the lending criteria you'll work with — region, ticket size, term, risk band. RentOS only sends you applications that match.",
    target: '[data-tour="fin-mandates"]',
    expression: 'pointing',
  },
  {
    title: 'Fund and track agreements',
    body:
      'Disburse to the landlord with one approval and follow repayments in real time. Every transaction is auditable end-to-end.',
    target: '[data-tour="fin-funding"]',
    expression: 'pointing',
  },
]

const employer: TourScript = [
  {
    title: 'Welcome — supporting your staff',
    body:
      "I'm Ama. As an employer, you can verify your staff's employment and help them secure homes faster — without exposing private payroll details.",
  },
  {
    title: 'Verify staff in one click',
    body:
      'When a staff member applies for a home or rent finance, you confirm employment with a single, secure approval. They never see your HR system.',
    target: '[data-tour="emp-staff"]',
    expression: 'pointing',
  },
  {
    title: 'Stay aware of obligations',
    body:
      "See an anonymised summary of staff rent commitments and any defaults. Helpful for staff welfare programmes — and you stay in control of what's shared.",
    target: '[data-tour="emp-obligations"]',
    expression: 'pointing',
  },
]

const adminScript: TourScript = [
  {
    title: 'Welcome to the admin console',
    body:
      "I'm Ama. RentOS keeps administration simple — users, audit, and settings, each with a clear screen of their own.",
  },
  {
    title: 'Users and roles',
    body:
      'Invite teammates, change roles, and revoke access from one screen. Every change is recorded.',
    target: '[data-tour="admin-users"]',
    expression: 'pointing',
  },
  {
    title: 'Audit log and settings',
    body:
      "Open the audit log to see exactly what happened and when. Platform settings are next door — adjust safely, knowing it's all tracked.",
    target: '[data-tour="admin-audit"]',
    expression: 'pointing',
  },
]

const super_admin: TourScript = [
  {
    title: 'Welcome to the super admin console',
    body:
      "I'm Ama. You have full reach across RentOS — let me point at the three rooms you'll visit most.",
  },
  {
    title: 'Users, organisations, and roles',
    body:
      'Manage every account on the platform here. Use this carefully — every action is logged with your name attached.',
    target: '[data-tour="admin-users"]',
    expression: 'pointing',
  },
  {
    title: 'Audit and global settings',
    body:
      "The audit log is your safety net — it captures everything sensitive. Platform settings change behaviour for the whole tenancy, so review changes before saving.",
    target: '[data-tour="admin-settings"]',
    expression: 'pointing',
  },
]

export const tourScripts: Record<UserRole, TourScript> = {
  tenant,
  landlord,
  property_manager,
  government,
  legal_officer,
  financier,
  employer,
  admin: adminScript,
  super_admin,
}
