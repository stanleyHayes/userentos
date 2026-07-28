# RentOS — Role Capabilities

Per-user-type capabilities: what's **done** (✅ shipped) and what's **left**
(P2 = next, P3 = later). Statuses as of 2026-07-28 (commit `1c6796f`).

## Status at a glance

| Role | P1 (this phase) | Remaining (P2/P3) |
|---|---|---|
| 👤 Tenant | ✅ Complete | 3 items |
| 🏠 Landlord | ✅ Complete | 3 items |
| 🏢 Agent / Property Manager | ✅ Complete | 3 items |
| 🔧 Service Provider | ✅ Complete | 3 items |
| 🛒 Local Business | ✅ Complete | 5 items |
| 🏦 Financier | ✅ Complete | 3 items |
| 🏢 Employer | ✅ Complete (bulk-invite UI pending) | 3 items |
| 🏛 Government / Admin | 1 P1 item left | 3 items |
| 🏗 Developer | Not started (marketing only) | 2 items |

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

**Left**
- P2 Tenant passport share view on mobile (exists on web)
- P2 Community reviews / neighborhood insights
- P3 Rent reporting to credit bureaus (exportable rental history)

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

**Left**
- P2 Automated rent escalation / renewal offers at term end
- P2 Landlord verification badge flow (Ghana Card check exists — surface it)
- P3 Bulk property import (CSV)

## 🏢 Property Manager / Agent

**Done**
- ✅ Managed properties, listings, applications (landlord toolset)
- ✅ AI writer for marketing copy
- ✅ Lead management: inquiry inbox per listing, pipeline (new → contacted → viewing → applied → closed/lost)
- ✅ Viewing scheduler: renters book slots; agent confirms/completes
- ✅ Commission tracking: record per deal, pending/paid summary

**Left**
- P2 Agency profile page (public, branded) + team members
- P2 Client (landlord) accounts: owners delegate properties with scoped permissions
- P3 Performance analytics (close rate, time-to-close, portfolio value)

## 🔧 Service Provider

**Done**
- ✅ Worker profile (trades, rates, radius, bio), marketplace listing
- ✅ Bookings: receive, accept/decline, complete; ratings & reviews
- ✅ Emergency availability flag
- ✅ Earnings dashboard: totals, pending payout, per-trade breakdown, 6-month trend
- ✅ Availability calendar editor
- ✅ Quote flow: worker sends priced quote → customer accepts/declines

**Left**
- P2 Portfolio photos on profile (before/after work)
- P2 Recurring jobs (weekly cleaning contracts)
- P3 Payouts to MoMo wallet; provider verification tiers surfaced in search ranking

## 🛒 Local Business

**Done**
- ✅ Business profile (category, city, contact), verified badge flag
- ✅ Listings: products, services, discount promos; active toggles
- ✅ Directory presence with filters; move-in placement on tenant agreements
- ✅ Inquiry/quote inbox: general or listing-specific requests, pipeline (new → contacted → won/lost), owner notifications
- ✅ Reviews & ratings from verified customers (won inquiry required; one updatable review per customer)
- ✅ Dashboard analytics: profile/listing views, inquiry totals + 30-day trend, wins, conversion

**Left**
- P2 Order/booking requests with fulfillment status (movers/cleaners: date scheduling; ISPs: installation slots)
- P2 Targeted campaigns: discounts surfaced only to tenants who signed in the business's city in the last 30 days ("new homeowner reach")
- P2 New-mover notifications: alert when a tenant signs in their city
- P3 Subscription tiers for businesses (featured placement)
- P3 Stock/product catalog with images

## 🏦 Financier

**Done**
- ✅ Financing offers CRUD, applications inbox, approve/reject → contract
- ✅ Contracts with repayment tracking, disbursement flow
- ✅ Payroll-deduction repayment channel (employer mandates)
- ✅ Portfolio analytics: disbursed vs recovered, default rate, exposure
- ✅ Collections queue: overdue contracts, reminder nudges (web + mobile)

**Left**
- P2 Credit decisioning assist: applicant rental history + credit score summary card
- P2 Offer targeting analytics (min credit score, employment-required fields exist)
- P3 Securitized reporting for banks (BoG-style export)

## 🏢 Employer

**Done**
- ✅ Employer profile (TIN, verification), employee roster (invite)
- ✅ Deduction mandates (employees sign; employer approves)
- ✅ Payroll runs: create → approve → process
- ✅ Payroll reports: per-run breakdowns, per-employee deduction history, CSV export

**Left**
- P1 ⏳ Bulk employee invite **UI** (CSV endpoint exists on server; no screen yet)
- P2 Employee housing benefit programs (subsidized rent advances via financier partners)
- P3 SSNIT/tax report integration

## 🏛 Government / Admin

**Done**
- ✅ Property review/approve, platform analytics, user management
- ✅ Feature flags, subscription package admin, insurance claims oversight
- ✅ Policy simulation, audit logs (server), public registry

**Left**
- P1 ⏳ Housing-demand dashboard: rental price trends per region, vacancy rates (only remaining P1 item)
- P2 Tax-compliance view: rent income reports per landlord (aggregated, consented)
- P2 Fraud watch: duplicate listings, suspicious payment patterns
- P3 National rental database export (anonymized)

## 🏗 Property Developer *(future role — currently marketing only)*

**Left**
- P2 Market analytics: demand by location/type/price band, demographic insights
- P3 Pre-sales/off-plan listings on the platform

---

## What's next (suggested order)

1. **P1 leftovers** — government housing-demand dashboard; employer bulk-invite UI
2. **P2 wave 1** — business order/fulfillment + new-mover notifications; provider portfolio photos; landlord rent renewal offers
3. **P2 wave 2** — agent agency pages + landlord delegation; financier credit decisioning; tenant passport on mobile
