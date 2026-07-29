# RentOS — Role Capabilities

Per-user-type capabilities and their shipped status as of 2026-07-29.

## Status at a glance

| Role | P1 (this phase) | Remaining (P2/P3) |
|---|---|---|
| 👤 Tenant | ✅ Complete | 0 |
| 🏠 Landlord | ✅ Complete | 0 |
| 🏢 Agent / Property Manager | ✅ Complete | 0 |
| 🔧 Service Provider | ✅ Complete | 0 |
| 🛒 Local Business | ✅ Complete | 0 |
| 🏦 Financier | ✅ Complete | 0 |
| 🏢 Employer | ✅ Complete | 0 |
| 🏛 Government / Admin | ✅ Complete | 0 |
| 🏗 Developer | ✅ Complete | 0 |

---

## 👤 Tenant

**Done**
- ✅ Discover: browse, search, swipe feed, AI recommendations, eligibility check
- ✅ Apply, sign digital agreements, pay rent (MoMo/bank), receipts
- ✅ RentGuard savings plans, wallet, micro-loans, investments
- ✅ Tenant profile + trust/credit score + profile-access control
- ✅ Maintenance requests, disputes, documents vault (web: upload), insurance purchase + claims
- ✅ Financing applications (rent advance, deposit loan), payroll-deduction mandates
- ✅ Worker marketplace bookings + ratings, reviews on properties
- ✅ Local services directory
- ✅ Move-in checklist driven by the agreement's city (web + mobile)

- ✅ Tenant passport preview and secure share-link flow on mobile
- ✅ Community neighborhood insights aggregated from verified property reviews
- ✅ Exportable rental-history CSV for credit-bureau reporting

## 🏠 Landlord

**Done**
- ✅ Properties CRUD + images, publish flow
- ✅ Applications review, tenant roster, tenant screening via profiles/credit
- ✅ Agreements (create on web), rent collection, auto-debit, reminders
- ✅ Subscription plans (Starter/Professional/Enterprise) with property limits
- ✅ Maintenance coordination, worker marketplace
- ✅ Analytics (income, occupancy), AI rental pricing + AI writer
- ✅ Insurance products for property, disputes
- ✅ Expense tracking per property (repairs, levies, utilities…)
- ✅ Vacancy dashboard (occupancy %, days-on-market, uncollected rent)

- ✅ Automated renewal offers with proposed rent/end date and tenant accept/decline
- ✅ Ghana Card verification request/review flow and verified landlord badge on listings
- ✅ Bulk property import from CSV with row-level failures and subscription-limit enforcement

## 🏢 Property Manager / Agent

**Done**
- ✅ Managed properties, listings, applications (landlord toolset)
- ✅ AI writer for marketing copy
- ✅ Lead management: inquiry inbox per listing, pipeline (new → contacted → viewing → applied → closed/lost)
- ✅ Viewing scheduler: renters book slots; agent confirms/completes
- ✅ Commission tracking: record per deal, pending/paid summary

- ✅ Public branded agency profile with team members and available listings
- ✅ Landlord delegation with scoped applications, maintenance, payments, editing, and leads access
- ✅ Performance analytics: close rate, time-to-close, completed viewings, commission and portfolio value

## 🔧 Service Provider

**Done**
- ✅ Worker profile (trades, rates, radius, bio), marketplace listing
- ✅ Bookings: receive, accept/decline, complete; ratings & reviews
- ✅ Emergency availability flag
- ✅ Earnings dashboard: totals, pending payout, per-trade breakdown, 6-month trend
- ✅ Availability calendar editor
- ✅ Quote flow: worker sends priced quote → customer accepts/declines

- ✅ Before/after portfolio images on provider profiles (web + mobile)
- ✅ Weekly, biweekly, and monthly recurring jobs with automatic next occurrence
- ✅ Wallet-debited MoMo payout requests and verification-tier search ranking

## 🛒 Local Business

**Done**
- ✅ Business profile (category, city, contact), verified badge flag
- ✅ Listings: products, services, discount promos; active toggles
- ✅ Directory presence with filters; move-in placement on tenant agreements
- ✅ Inquiry/quote inbox: general or listing-specific requests, pipeline (new → contacted → won/lost), owner notifications
- ✅ Reviews & ratings from verified customers (won inquiry required; one updatable review per customer)
- ✅ Dashboard analytics: profile/listing views, inquiry totals + 30-day trend, wins, conversion

- ✅ Order/booking requests with participant, scheduling, and fulfillment status ledger
- ✅ New-mover-only offers, restricted to tenants with a lease signed in the business city within 30 days
- ✅ Idempotent new-mover notifications to businesses when a nearby agreement activates
- ✅ Wallet-paid featured subscription with 30-day placement and automatic expiry
- ✅ Product stock quantities and image catalogs

## 🏦 Financier

**Done**
- ✅ Financing offers CRUD, applications inbox, approve/reject → contract
- ✅ Contracts with repayment tracking, disbursement flow
- ✅ Payroll-deduction repayment channel (employer mandates)
- ✅ Portfolio analytics: disbursed vs recovered, default rate, exposure
- ✅ Collections queue: overdue contracts, reminder nudges (web + mobile)

- ✅ Credit decisioning card with live credit, rental, and payment history
- ✅ Offer targeting analytics using minimum credit score and employment requirements
- ✅ Financier-scoped BoG-style securitized contract export

## 🏢 Employer

**Done**
- ✅ Employer profile (TIN, verification), employee roster (invite)
- ✅ Deduction mandates (employees sign; employer approves)
- ✅ Payroll runs: create → approve → process
- ✅ Payroll reports: per-run breakdowns, per-employee deduction history, CSV export

- ✅ Bulk employee CSV import UI with preview, validation, row results, and 500-row guard
- ✅ Employee housing-benefit program workflows linked to participants/financier partners
- ✅ SSNIT/tax-compatible processed-payroll deduction export

## 🏛 Government / Admin

**Done**
- ✅ Property review/approve, platform analytics, user management
- ✅ Feature flags, subscription package admin, insurance claims oversight
- ✅ Policy simulation, audit logs (server), public registry

- ✅ Housing-demand dashboard: regional rent ranges, vacancy, applications, and six-month trends (web + mobile)
- ✅ Consent-gated aggregated landlord rent-income reporting
- ✅ Fraud watch for duplicate listings and suspicious failed-payment patterns
- ✅ Anonymized national rental database CSV export

## 🏗 Property Developer

**Done**
- ✅ Dedicated developer registration/role and advanced capability workspace
- ✅ Market analytics by location/type/rent with anonymized household demographic segments
- ✅ Pre-sales/off-plan workflow with public development listings

---

## Completion

All capabilities originally listed in this document now have server contracts and user-facing surfaces. The shared implementation ledger and verification evidence are maintained in `agent_plan.md`.
