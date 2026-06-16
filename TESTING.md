# RentOS Ghana - Manual E2E Testing Checklist

> All demo accounts use password: **`password123`**

---

## Table of Contents

1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Tenant Flows](#2-tenant-flows)
3. [Landlord / Property Manager Flows](#3-landlord--property-manager-flows)
4. [Government / Legal Officer Flows](#4-government--legal-officer-flows)
5. [Admin / Super Admin Flows](#5-admin--super-admin-flows)
6. [Financial Features (RentGuard)](#6-financial-features-rentguard)
7. [Disputes](#7-disputes)
8. [Messaging & Notifications](#8-messaging--notifications)
9. [Blog & Legal Content](#9-blog--legal-content)
10. [Documents](#10-documents)
11. [Subscription & Package Enforcement](#11-subscription--package-enforcement)
12. [Settings & Profile](#12-settings--profile)
13. [Public Pages](#13-public-pages)
14. [Responsive & Cross-Browser](#14-responsive--cross-browser)
15. [Edge Cases & Error Handling](#15-edge-cases--error-handling)

---

## 1. Authentication & Onboarding

### Registration
- [ ] Register a new tenant account (email, phone, password, name, role selection)
- [ ] Register a new landlord account
- [ ] Verify validation errors appear for invalid email, short password, missing fields
- [ ] Verify duplicate email is rejected
- [ ] Verify successful registration redirects to dashboard

### Login
- [ ] Login with `kwame@rentos.gh` (tenant)
- [ ] Login with `yaw@rentos.gh` (landlord)
- [ ] Login with `manager@rentos.gh` (property manager)
- [ ] Login with `gov@rentos.gh` (government)
- [ ] Login with `legal@rentos.gh` (legal officer)
- [ ] Login with `admin@rentos.gh` (admin)
- [ ] Login with `superadmin@rentos.gh` (super admin)
- [ ] Verify wrong password shows error
- [ ] Verify non-existent email shows error

### Session Persistence
- [ ] Login, refresh the page - should stay logged in (not redirect to login)
- [ ] Login, close tab, reopen - should stay logged in
- [ ] Logout, verify redirect to login
- [ ] Verify token expiry eventually forces re-login

### Password Reset
- [ ] Navigate to "Forgot Password" from login page
- [ ] Submit email for password reset
- [ ] Verify reset password page loads with token
- [ ] Verify password change works (if email configured)

---

## 2. Tenant Flows

> Login as: `kwame@rentos.gh`

### Dashboard
- [ ] Dashboard loads with correct greeting and stats
- [ ] Revenue/payment chart renders correctly
- [ ] Quick action links work (Properties, Payments, Savings, etc.)
- [ ] Stats cards show correct counts (agreements, payments, savings)

### Browse Properties
- [ ] `/properties` - List of available properties loads
- [ ] Filter by type (apartment, house, room, commercial, warehouse)
- [ ] Filter by region, city
- [ ] Filter by price range (min/max rent)
- [ ] Filter by bedrooms, bathrooms
- [ ] Filter by furnished/unfurnished
- [ ] Search by keyword
- [ ] Sort by price, date, etc.
- [ ] Only `approved` listings are visible to tenants
- [ ] Click property card opens detail page

### Property Detail
- [ ] `/properties/:id` - Property detail loads with images, description, amenities
- [ ] Image gallery/carousel works
- [ ] Favorite/unfavorite toggle works
- [ ] "Apply" button visible (if no active lease blocking)
- [ ] Property info grid shows all details (rent, type, address, rules)
- [ ] Landlord contact info shown appropriately
- [ ] Reviews section visible

### Saved Properties
- [ ] `/saved` - List of favorited properties loads
- [ ] Can unfavorite from this page
- [ ] Clicking a saved property navigates to detail

### Applications
- [ ] Submit a rental application from property detail
- [ ] Select profile sections to share (personal, academic, professional, family, etc.)
- [ ] Verify application appears in `/applications` list
- [ ] Verify application status shows as "pending"
- [ ] Withdraw a pending application
- [ ] Verify can't apply to same property twice
- [ ] Verify lease restriction: can't apply for long-stay if active lease >3 months remaining

### Agreements
- [ ] `/agreements` - List of agreements loads
- [ ] Click agreement navigates to `/agreements/:id` detail page
- [ ] View agreement terms (rent amount, duration, start/end dates)
- [ ] Sign a pending agreement (if one exists)
- [ ] Verify active agreement shows correct status
- [ ] Decline renewal on an agreement nearing expiry

### Payments
- [ ] `/payments` - Payment list loads
- [ ] Make a payment (select method: MTN MoMo, Telecel Cash, AirtelTigo Money, Bank Transfer)
- [ ] Verify payment appears in list with correct status
- [ ] Filter payments by status (pending, completed, failed)
- [ ] View payment detail

### Credit Score
- [ ] `/credit-score` - Score loads with breakdown
- [ ] Verify score factors displayed (payment history, savings, compliance, disputes, account age)
- [ ] Verify insights/tips shown
- [ ] Verify 90-day history chart renders

### Tenant Profile
- [ ] `/my-profile` - Profile editor loads
- [ ] Fill out personal info (DOB, gender, marital status, nationality, etc.)
- [ ] Fill out education section
- [ ] Fill out employment section (status, employer, income)
- [ ] Fill out family section
- [ ] Fill out lifestyle section (smoking, pets, noise level)
- [ ] Fill out vehicle section
- [ ] Add references (personal + professional)
- [ ] Add previous rental history
- [ ] Add emergency contact
- [ ] Set search preferences (regions, cities, budget, property type)
- [ ] Upload verification documents (ID, proof of income, selfie)
- [ ] Verify completion score updates as sections are filled

### Profile Access
- [ ] `/profile-access` - View incoming access requests from landlords
- [ ] Approve an access request
- [ ] Deny an access request
- [ ] Revoke a previously approved access

---

## 3. Landlord / Property Manager Flows

> Login as: `yaw@rentos.gh` (landlord) or `manager@rentos.gh` (property manager)

### Dashboard
- [ ] Landlord dashboard loads with portfolio overview
- [ ] Stats cards show correct property count, tenant count, revenue
- [ ] Revenue chart renders correctly
- [ ] Quick links work (Properties, Tenants, Payments, etc.)

### Property Management
- [ ] `/properties` with `?mine=true` - Shows only owned properties
- [ ] All property statuses visible (available, occupied, maintenance, etc.)
- [ ] All listing statuses visible (draft, pending_review, approved, rejected)

### Create Property
- [ ] `/properties/new` - Form loads
- [ ] Fill out title, description, type, address (street, city, region)
- [ ] Set rent amount, duration, advance months
- [ ] Add amenities, rules
- [ ] Upload images (up to 10, max 10MB each)
- [ ] Submit creates property in "draft" status
- [ ] Publish property (moves to "pending_review")
- [ ] Verify subscription limit enforcement (Starter = max 3 properties)

### Edit Property
- [ ] Edit an existing property (title, description, rent, etc.)
- [ ] Add/remove images
- [ ] Update status

### Tenants
- [ ] `/tenants` - List of current tenants loads
- [ ] Each tenant shows agreement info, payment history
- [ ] Can navigate to tenant profile (if access approved)

### Applications (Landlord View)
- [ ] `/applications` - View pending applications
- [ ] Review application details and shared profile sections
- [ ] Approve application (should auto-create draft agreement)
- [ ] Reject application with reason
- [ ] Verify approved tenant's shared profile data is visible

### Agreements (Landlord View)
- [ ] Create a new agreement manually (select property, tenant, terms)
- [ ] Sign an agreement as landlord
- [ ] View agreement details and compliance flags
- [ ] Update agreement terms (before signing)

### Request Tenant Profile Access
- [ ] Request access to a tenant's profile from `/profile-access`
- [ ] Verify request shows as "pending"
- [ ] Once approved by tenant, verify profile is viewable

### Analytics
- [ ] `/analytics` - Landlord analytics page loads
- [ ] Revenue charts render (monthly revenue bars)
- [ ] Property status donut chart renders
- [ ] Occupancy rate and collection rate gauges render
- [ ] KPI cards show correct data
- [ ] Property type breakdown shows correctly

---

## 4. Government / Legal Officer Flows

> Login as: `gov@rentos.gh` (government) or `legal@rentos.gh` (legal officer)

### Government Dashboard
- [ ] Dashboard loads with platform-wide stats
- [ ] Charts render correctly (no dimension warnings)
- [ ] Stats: total users, properties, payment volume, disputes

### Government Panel
- [ ] `/government` - Full panel loads
- [ ] Tabs work: Overview, Properties, Financial, People, Engagement, System
- [ ] Overview tab: KPI cards, volume chart, gauge cards
- [ ] Properties tab: Property breakdown by status/type/region
- [ ] Financial tab: Payment volume, investment/loan stats
- [ ] People tab: User stats, tenant profiles, credit distribution
- [ ] Engagement tab: Disputes, reviews, notifications, messaging stats
- [ ] System tab: Documents, audit logs, agreements

### Property Reviews
- [ ] `/government/reviews` - Pending review queue loads
- [ ] Review a property (approve or reject with reason)
- [ ] Verify approved property becomes visible to tenants
- [ ] Verify rejected property returns to landlord

### Policy Simulation
- [ ] `/government/simulation` - Simulation page loads
- [ ] Run rent cap simulation (set max rent, select region)
- [ ] View impact analysis results
- [ ] Run advance limit simulation (set max months)
- [ ] View market health metrics

### Platform Analytics
- [ ] `/analytics` - Platform analytics loads (gov/admin view)
- [ ] All chart types render: bar charts, donut charts, progress rings
- [ ] Data matches expected counts from database
- [ ] Regional distribution shows correctly
- [ ] Credit score distribution donut renders
- [ ] Financial stats (investments, loans, savings) display

### Dispute Management (Gov)
- [ ] View all platform disputes
- [ ] Open dispute detail page (`/disputes/:id`)
- [ ] Government action panel appears
- [ ] Update dispute status (filed -> mediation -> escalated -> resolved -> closed)
- [ ] Add mediation notes
- [ ] Add resolution notes
- [ ] Status timeline updates correctly

### User Management
- [ ] `/users` - User list loads (admin/gov)
- [ ] Create a new user with roles and permissions
- [ ] Edit user permissions
- [ ] Delete a user (not self, not super_admin)

---

## 5. Admin / Super Admin Flows

> Login as: `superadmin@rentos.gh` (super admin) or `admin@rentos.gh` (admin)

### All Pages Accessible
- [ ] Verify sidebar shows all navigation items
- [ ] Can access every route without permission errors

### Subscription Packages
- [ ] `/admin/packages` - Package list loads with all 3 seeded packages
- [ ] Stats strip shows correct counts (total, active, free, paid)
- [ ] Create new package (name, slug, description, price, billing cycle, max properties, benefits)
- [ ] Edit existing package
- [ ] Delete package (verify can't delete if subscribers exist)
- [ ] Toggle isActive / isDefault flags
- [ ] Verify mobile layout is responsive

### Assign Packages
- [ ] Assign a package to a landlord user via API
- [ ] Verify the landlord's subscription info updates

### Invitations
- [ ] Send invitation to new email with role assignment
- [ ] Resend an invitation
- [ ] Revoke an invitation
- [ ] Verify pending invitations in credentials match

### AI Content Generation
- [ ] Test AI text generation endpoint (if configured)

---

## 6. Financial Features (RentGuard)

> Login as: `kwame@rentos.gh` (tenant with active loans & investments)

### Wallet
- [ ] `/savings` - Wallet tab loads with current balance
- [ ] Deposit funds to wallet
- [ ] Withdraw funds from wallet
- [ ] Transaction history shows correctly
- [ ] Balance updates after each transaction

### Savings Plans
- [ ] View existing savings plans
- [ ] Create a new savings plan (name, target amount, frequency: daily/weekly/monthly)
- [ ] Contribute to an existing plan
- [ ] Verify progress bar updates
- [ ] Pause/cancel a plan
- [ ] Verify completed plan shows correctly

### Investments
- [ ] Switch to Investments tab
- [ ] Browse investment options (Treasury Bills, Government Bonds)
- [ ] View partner details (Databank, Epack)
- [ ] Create a new investment (select option, tenure, amount)
- [ ] View active investments with status
- [ ] Withdraw matured investment
- [ ] Verify early withdrawal penalty warning

### Loans
- [ ] View existing loans
- [ ] Apply for a micro-loan (requires credit score >= 50)
- [ ] Select agreement, amount, tenure, reason
- [ ] Verify auto-approval for credit >= 70
- [ ] Make a loan repayment
- [ ] View loan repayment schedule
- [ ] Verify can't apply if credit < 50

> Also test with `abena@rentos.gh` (credit 35) - loan should be rejected

---

## 7. Disputes

### Tenant Filing

> Login as: `kwame@rentos.gh` (tenant)

- [ ] Navigate to `/disputes`
- [ ] Click "File Dispute" (requires active agreement)
- [ ] Fill form: title, category (rent increase, eviction, maintenance, deposit, illegal clause, other)
- [ ] Description with min 10 characters
- [ ] Submit dispute
- [ ] Verify dispute appears in list with "filed" status
- [ ] Click dispute card navigates to `/disputes/:id` detail page

### Dispute Detail Page
- [ ] Back link navigates to disputes list
- [ ] Title, status badge, category, date display correctly
- [ ] Status timeline renders (filed -> mediation -> escalated -> resolved -> closed)
- [ ] Info grid shows category, filed date, property, filed against
- [ ] Description section shows full text
- [ ] Evidence section shows (upload button if not closed)
- [ ] Upload evidence files (images, videos, PDFs)
- [ ] Uploaded evidence displays with type icon and date
- [ ] Evidence links open in new tab

### Government Resolution

> Login as: `gov@rentos.gh`

- [ ] View all disputes in list
- [ ] Open a dispute detail page
- [ ] Government Actions panel appears (expandable)
- [ ] Change status to "Under Mediation"
- [ ] Add mediation notes
- [ ] Change status to "Resolved"
- [ ] Add resolution notes
- [ ] Verify timeline updates
- [ ] Verify resolved disputes show resolution section

### Tenant View After Resolution

> Login back as tenant

- [ ] Dispute shows updated status
- [ ] Mediation notes visible
- [ ] Resolution notes visible
- [ ] Upload button hidden for closed/resolved disputes

---

## 8. Messaging & Notifications

> Login as: `kwame@rentos.gh`

### Chat
- [ ] `/messages` - Chat page loads
- [ ] Conversation list shows with unread indicators
- [ ] Search for a user to start new conversation
- [ ] Start new conversation
- [ ] Send a message
- [ ] Message appears in chat thread
- [ ] Switch between conversations
- [ ] Mark conversation as read
- [ ] Verify unread badge count in sidebar updates

### Notifications
- [ ] Notification bell/icon shows count
- [ ] Click to view notification list
- [ ] Mark individual notification as read
- [ ] Mark all as read
- [ ] Verify notifications arrive for: payments, disputes, applications, agreements, profile access

### Badge Counts (Sidebar)
- [ ] Verify badge counts update for: applications, agreements, disputes, payments, profile access, messages
- [ ] Badges refresh periodically (every 30s)

---

## 9. Blog & Legal Content

### Blog (Public)
- [ ] `/blog` - Public blog list loads (published posts only)
- [ ] Click post to view detail
- [ ] `/article/:slug` - Public article page loads

### Blog (Admin/Gov/Legal)

> Login as: `admin@rentos.gh`

- [ ] `/blog` - Full blog list with edit controls
- [ ] `/blog/new` - Create new blog post (title, content with markdown editor, tags)
- [ ] Save as draft
- [ ] Publish post
- [ ] `/blog/edit/:id` - Edit existing post
- [ ] Delete a post

### Legal Articles

> Login as: `legal@rentos.gh`

- [ ] `/legal` - Legal articles list loads
- [ ] Create new legal article (title, content, simplified content, category, law reference)
- [ ] Set language (English, Twi, Ga, Ewe)
- [ ] Edit existing article
- [ ] Delete article

### Public Legal Pages
- [ ] `/rental-laws` - Rental laws guide loads
- [ ] `/privacy` - Privacy policy loads
- [ ] `/terms` - Terms of service loads
- [ ] `/data-protection` - Data protection page loads

---

## 10. Documents

> Login as: `kwame@rentos.gh`

- [ ] `/documents` - Document list loads
- [ ] Upload a document (select type: rental_agreement, receipt, legal_notice, evidence, identity, other)
- [ ] Set access control (share with specific users)
- [ ] View uploaded document
- [ ] Upload new version of existing document
- [ ] View version history
- [ ] View audit trail (who accessed/modified)
- [ ] Delete a document (owner only)
- [ ] Verify non-owners with access can view but not delete

---

## 11. Subscription & Package Enforcement

### View Packages

> Login as: `yaw@rentos.gh` (landlord, Starter package)

- [ ] `/subscription` - Current subscription info loads
- [ ] Shows package name, property limit, current property count
- [ ] Browse available upgrade options

### Property Limit Enforcement
- [ ] Verify current property count against package limit
- [ ] If at limit (Starter = 3), attempt to create new property
- [ ] Verify error message: "You have reached the maximum of X properties..."
- [ ] Upgrade to Professional package
- [ ] Verify can now create more properties (up to 10)

### No Subscription
- [ ] Create a new landlord account (no package assigned)
- [ ] Attempt to create a property
- [ ] Verify error: "You need an active subscription package..."

### Admin Package Management

> Login as: `superadmin@rentos.gh`

- [ ] Create a custom package
- [ ] Edit package benefits and limits
- [ ] Deactivate a package
- [ ] Verify deactivated package not shown to users
- [ ] Assign package to a user
- [ ] Verify can't delete package with active subscribers

---

## 12. Settings & Profile

> Login as any user

### Account Settings
- [ ] `/settings` - Settings page loads
- [ ] Update first name, last name, phone
- [ ] Upload profile photo
- [ ] Verify photo appears in header/sidebar

### Theme
- [ ] Toggle dark/light mode
- [ ] Verify "system" follows OS preference
- [ ] Verify theme persists after refresh

### Notification Preferences
- [ ] Toggle email notifications
- [ ] Toggle SMS notifications
- [ ] Toggle push notifications
- [ ] Toggle payment alerts
- [ ] Toggle savings alerts

### Password Change
- [ ] Change password (enter old + new password)
- [ ] Verify can login with new password
- [ ] Verify old password no longer works

### Role Switching
- [ ] For multi-role users, switch active role
- [ ] Verify sidebar navigation updates for new role
- [ ] Verify dashboard changes to match role

---

## 13. Public Pages

> Not logged in

### Landing Page
- [ ] `/` - Landing page loads with hero section
- [ ] Feature sections render
- [ ] CTA buttons work (Register, Login)
- [ ] Scroll animations work
- [ ] Responsive on mobile

### Public Property Browsing
- [ ] Can browse approved properties without login
- [ ] Property detail accessible without login
- [ ] Login/register prompt appears for protected actions (apply, favorite)

### Legal Pages
- [ ] `/privacy` loads correctly
- [ ] `/terms` loads correctly
- [ ] `/data-protection` loads correctly
- [ ] `/rental-laws` loads correctly

### Blog
- [ ] `/article/:slug` - Public blog post loads
- [ ] Only published posts visible

### Not Found
- [ ] Navigate to `/random-nonexistent-path`
- [ ] 404 page renders with navigation options

---

## 14. Responsive & Cross-Browser

### Mobile (< 640px)
- [ ] Sidebar collapses to hamburger menu
- [ ] All pages render without horizontal overflow
- [ ] Forms are usable (inputs not cut off, MUI TextFields have proper spacing)
- [ ] Cards stack vertically
- [ ] Modals are scrollable and not cut off
- [ ] Buttons are tappable (min 44px touch target)
- [ ] Tables scroll horizontally or stack on mobile

### Tablet (640px - 1024px)
- [ ] Grid layouts adapt (2-column where appropriate)
- [ ] Sidebar can toggle collapsed/expanded
- [ ] Charts and visualizations resize properly

### Desktop (> 1024px)
- [ ] Full sidebar visible
- [ ] Grid layouts use 3-4 columns
- [ ] Content max-width constrained (max-w-7xl)

### Dark Mode
- [ ] All pages render correctly in dark mode
- [ ] No white flash on page transitions
- [ ] Charts/visualizations use dark-appropriate colors
- [ ] Text is readable (sufficient contrast)
- [ ] Form inputs visible and styled

### Cross-Browser
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome (Android)

---

## 15. Edge Cases & Error Handling

### Network Errors
- [ ] Disable network, attempt API call - error boundary catches
- [ ] Error boundary shows "Connection Issue" with retry button
- [ ] Retry button works when network restored
- [ ] "Go Home" and "Go Back" buttons work on error page

### Invalid Data
- [ ] Navigate to `/properties/nonexistent-id` - shows not found state
- [ ] Navigate to `/disputes/nonexistent-id` - shows not found state
- [ ] Navigate to `/agreements/nonexistent-id` - shows not found state
- [ ] Submit forms with empty required fields - validation errors shown
- [ ] Submit payment with invalid amount - error shown

### Auth Edge Cases
- [ ] Access `/dashboard` without login - redirects to `/login`
- [ ] Access `/admin/packages` as tenant - forbidden/no access
- [ ] Access `/government` as tenant - forbidden/no access
- [ ] Expired token triggers re-login gracefully
- [ ] Multiple tabs - logout in one logs out all

### Concurrent Actions
- [ ] Two users apply for same property simultaneously
- [ ] Double-click submit buttons - no duplicate submissions
- [ ] Upload large files - progress shown, timeout handled

### Empty States
- [ ] New account with no data - empty states shown for:
  - [ ] Properties (no properties)
  - [ ] Agreements (no agreements)
  - [ ] Payments (no payments)
  - [ ] Disputes (no disputes)
  - [ ] Savings (no plans)
  - [ ] Documents (no documents)
  - [ ] Messages (no conversations)
  - [ ] Applications (no applications)

### Splash Screen
- [ ] Splash screen appears on initial load
- [ ] Animation completes and transitions to app
- [ ] App is functional after splash dismisses

---

## Test Accounts Quick Reference

| Role | Email | Key Traits |
|------|-------|------------|
| Tenant 1 | `kwame@rentos.gh` | Credit 78, active loans & investments |
| Tenant 2 | `ama@rentos.gh` | Credit 65, marketing manager |
| Tenant 3 | `kofi@rentos.gh` | Credit 88, CEO |
| Tenant 4 | `abena@rentos.gh` | Credit 35, unverified |
| Tenant 5 | `akua@rentos.gh` | Credit 82, diplomat |
| Tenant 6 | `yeboah@rentos.gh` | Credit 76, finance director |
| Tenant 7 | `nii@rentos.gh` | Credit 55, logistics officer |
| Tenant 8 | `serwa@rentos.gh` | Credit 28, unverified |
| Landlord 1 | `yaw@rentos.gh` | 8 properties, Accra |
| Landlord 2 | `adjoa@rentos.gh` | 6 properties, nationwide |
| Landlord 3 | `kwaku@rentos.gh` | 6 properties, Trasacco/Cape Coast |
| Landlord 4 | `efua@rentos.gh` | 4 properties, Tamale/Ho/Sunyani |
| Manager 1 | `manager@rentos.gh` | 4 managed properties |
| Manager 2 | `kwadwo@rentos.gh` | 2 managed properties |
| Government | `gov@rentos.gh` | Review, disputes, analytics, simulation |
| Legal | `legal@rentos.gh` | Disputes, blog, legal articles |
| Admin | `admin@rentos.gh` | Users, properties, disputes, blog |
| Admin 2 | `ofi@rentos.gh` | Full admin + manage_permissions |
| Super Admin | `superadmin@rentos.gh` | Bypasses ALL permission checks |
