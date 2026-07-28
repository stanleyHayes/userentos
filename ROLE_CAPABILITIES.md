# RentOS — Role Capabilities Plan

Per-user-type capability brainstorm: what each role can do **today** (✅ built),
what's **planned** (P1 = next up, P2 = after, P3 = later), and the services each
user type can offer through the platform. Statuses reflect the codebase as of
commit `10e16d5` (web + mobile).

---

## 👤 Tenant

Services they consume; capabilities they perform.

- ✅ Discover: browse, search, swipe feed, AI recommendations, eligibility check
- ✅ Apply, sign digital agreements, pay rent (MoMo/bank), receipts
- ✅ RentGuard savings plans, wallet, micro-loans, investments
- ✅ Tenant profile + trust/credit score + profile-access control
- ✅ Maintenance requests, disputes, documents vault (web: upload), insurance purchase + claims
- ✅ Financing applications (rent advance, deposit loan), payroll-deduction mandates
- ✅ Worker marketplace bookings + ratings, reviews on properties
- ✅ Local services directory (new)
- P1 ✅ Move-in checklist (utilities setup, internet, movers — driven by the agreement's city)
- P2 Tenant passport share view on mobile (exists on web)
- P2 Community reviews / neighborhood insights
- P3 Rent reporting to credit bureaus (exportable rental history)

## 🏠 Landlord

Services they offer: rental housing, managed tenancy.

- ✅ Properties CRUD + images, publish flow, vacancy via listings
- ✅ Applications review, tenant roster, tenant screening via profiles/credit
- ✅ Agreements (create on web), rent collection, auto-debit, reminders
- ✅ Subscription plans (Starter/Professional/Enterprise) with property limits
- ✅ Maintenance coordination, worker marketplace
- ✅ Analytics (income, occupancy), AI rental pricing + AI writer
- ✅ Insurance products for property, disputes
- P1 ✅ Expense tracking per property (repairs, levies, utilities)
- P1 ✅ Vacancy dashboard (days-on-market per listing)
- P2 Automated rent escalation / renewal offers at term end
- P2 Landlord verification badge flow (Ghana Card check exists — surface it)
- P3 Bulk property import (CSV)

## 🏢 Property Manager / Agent

Services they offer: property marketing, tenant placement, portfolio management for owners.

- ✅ Managed properties, listings, applications (landlord toolset)
- ✅ AI writer for marketing copy
- P1 ✅ Lead management: inquiry inbox per listing, lead status pipeline (new → contacted → viewing → applied → closed)
- P1 ✅ Viewing scheduler: tenants book viewing slots; agent calendar
- P1 ✅ Commission tracking: % or flat fee recorded per closed deal, payout summary
- P2 Agency profile page (public, branded) + team members
- P2 Client (landlord) accounts: owners delegate properties with scoped permissions
- P3 Performance analytics (close rate, time-to-close, portfolio value)

## 🔧 Service Provider (artisans, movers, cleaners…)

Services they offer: trade/repair work, moving & relocation, cleaning, installations.

- ✅ Worker profile (trades, rates, radius, bio), marketplace listing
- ✅ Bookings: receive, accept/decline, complete; ratings & reviews
- ✅ Emergency availability flag
- P1 ✅ Earnings dashboard: completed-job totals, pending payouts, per-trade breakdown
- P1 ✅ Availability calendar UI (model already stores per-day availability)
- P1 ✅ Quote flow: customer describes job → provider sends priced quote → accept converts to booking
- P2 Portfolio photos on profile (before/after work)
- P2 Recurring jobs (weekly cleaning contracts)
- P3 Payouts to MoMo wallet; provider verification tiers surfaced in search ranking

## 🛒 Local Business (furniture, appliances, internet, moving, cleaning, insurance, banks)

Services they offer: products, services, and discounts to renters — especially at move-in.

- ✅ Business profile (category, city, contact), verified badge flag
- ✅ Listings: products, services, discount promos; active toggles
- ✅ Directory presence with filters; move-in placement on tenant agreements
- ✅ Inquiry/quote inbox — renters can request a general or listing-specific quote; businesses receive trusted contact details and move each lead through new → contacted → won/lost.
- ✅ Reviews & ratings from verified customers (a won inquiry is required; one updatable review per customer)
- ✅ Dashboard analytics: profile views, listing views, inquiry totals/trend data, open leads, wins, and conversion
- P2 Order/booking requests with fulfillment status (for movers/cleaners: date scheduling; for ISPs: installation slots)
- P2 Targeted campaigns: offer a discount surfaced only to tenants who signed an agreement in the business's city in the last 30 days ("new homeowner reach")
- P2 New-mover notifications: alert when a tenant signs in their city
- P3 Subscription tiers for businesses (featured placement in directory + move-in sections)
- P3 Stock/product catalog with images

## 🏦 Financier (banks, microfinance, fintechs)

Services they offer: rent advances, deposit loans, rent-to-own, payroll-linked credit.

- ✅ Financing offers CRUD, applications inbox, approve/reject → contract
- ✅ Contracts with repayment tracking, disbursement flow
- ✅ Payroll-deduction repayment channel (employer mandates)
- P1 ✅ Portfolio analytics: disbursed vs recovered, default rate, exposure per product
- P1 ✅ Collections queue: overdue contracts, reminder nudges
- P2 Credit decisioning assist: applicant rental history + credit score summary card
- P2 Offer targeting (min credit score, employment-required — fields exist; surface analytics on them)
- P3 Securitized reporting for banks (CBN/BoG-style export)

## 🏢 Employer

Services they offer: payroll deduction as a repayment/savings channel for employees.

- ✅ Employer profile (TIN, verification), employee roster (invite)
- ✅ Deduction mandates (employees sign; employer approves)
- ✅ Payroll runs: create → approve → process
- P1 ✅ Payroll reports: per-run breakdowns, per-employee deduction history, export
- P1 ✅ Bulk employee invite (CSV — endpoint exists on server)
- P2 Employee housing benefit programs (subsidized rent advances via financier partners)
- P3 SSNIT/tax report integration

## 🏛 Government / Admin

Services: oversight, data, compliance.

- ✅ Property review/approve, platform analytics, user management
- ✅ Feature flags, subscription package admin, insurance claims oversight
- ✅ Policy simulation, audit logs (server), public registry
- P1 Housing-demand dashboard: rental price trends per region, vacancy rates
- P2 Tax-compliance view: rent income reports per landlord (aggregated, consented)
- P2 Fraud watch: duplicate listings, suspicious payment patterns
- P3 National rental database export (anonymized)

## 🏗 Property Developer *(future role — currently marketing only)*

Services they consume: demand intelligence.

- P2 Market analytics: demand by location/type/price band, demographic insights
- P3 Pre-sales/off-plan listings on the platform

---

## Implementation order (agreed starting point)

1. ✅ **P1 Local Business depth** — inquiries pipeline + verified-customer reviews + dashboard analytics
2. **P1 Service provider earnings + quotes** ← next
3. P1 Agent leads + viewings + commissions
4. P1 Financier portfolio + collections
5. P1 Landlord expenses + vacancy
6. P1 Employer payroll reports
