# RentOS Ghana

**Ghana's National Digital Rental Housing Platform**

Find properties, sign legally compliant agreements, pay rent via mobile money, build your credit score, and resolve disputes — all in one platform.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Client (Web)** | React 19, TypeScript, Vite, Tailwind CSS, Recharts, React Router, React Query |
| **Mobile** | React Native (Expo), Expo Router, TypeScript |
| **Server** | Node.js, Express, TypeScript, MongoDB (Mongoose) |
| **Auth** | JWT (access + refresh tokens), bcrypt |
| **Payments** | MTN MoMo, Telecel Cash, AirtelTigo Money, Bank Transfer |
| **Real-time** | Socket.io (notifications, messages, badges) |
| **File Storage** | Multer (local uploads) |
| **Deployment** | Vercel (client), Render / Railway (server) |

## Monorepo Structure

```
RentOS/
├── client/          # React web app
├── mobile/          # React Native (Expo) app
├── server/          # Express API server
└── shared/          # Shared TypeScript types
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)
- npm or yarn

### Installation

```bash
# Install all dependencies
cd client && npm install
cd ../server && npm install
cd ../mobile && npm install
```

### Environment Variables

**Server** (`server/.env`):
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/rentos
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
```

**Client** (`client/.env`):
```
VITE_API_URL=http://localhost:5000/api
```

**Mobile** (`mobile/.env`):
```
EXPO_PUBLIC_API_URL=http://localhost:5000/api
```

### Running

```bash
# Server
cd server && npm run dev

# Client
cd client && npm run dev

# Mobile
cd mobile && npx expo start
```

---

## User Roles

RentOS supports 6 user roles, each with distinct capabilities:

| Role | Description |
|------|------------|
| **Tenant** | Individual renting properties |
| **Landlord** | Property owner / rent collector |
| **Property Manager** | Manages properties on behalf of landlords |
| **Government** | Housing regulator / government official |
| **Legal Officer** | Legal oversight and dispute resolution |
| **Admin / Super Admin** | System administrator |

---

## Role-Based Functionality

### Tenant

#### Dashboard
- Active agreements, next payment due, savings progress, credit score, wallet balance
- Residence status indicator (currently residing or no active lease)

#### Properties
- Browse and search approved listings with filters (location, price, type, amenities, bedrooms, bathrooms, furnished, parking)
- Qualification check against landlord preferences (credit score, income, lifestyle)
- Save/favorite properties for later
- Leave reviews on rented properties
- Occupied properties hidden unless lease ends within 3 months AND tenant indicated non-renewal

#### Applications
- Submit rental applications with selectable profile sections to share
- Withdraw pending applications
- Blocked from applying if active lease has >3 months remaining (unless non-renewal indicated)

#### Agreements
- View all agreements (draft, pending_signatures, active, expired, terminated, disputed)
- Sign agreements (requires 100% profile completion)
- Decline lease renewal
- View compliance flags and landlord info

#### Payments
- Pay rent via MTN MoMo, Telecel Cash, AirtelTigo Money, or bank transfer
- View full payment history and status

#### RentGuard (Tenant-Exclusive)
- **Wallet**: Deposit and withdraw funds via mobile money or bank transfer
- **Savings Plans**: Create goals with target amounts, set contribution frequency (daily/weekly/monthly), auto-debit option
- **Micro-Loans**: Apply for rent shortfall protection
  - Eligibility: credit score >= 50 and active agreement
  - Auto-approved if credit score >= 70
  - Max GHS 10,000, 1-12 month tenure, 15% annual interest
- **Loan Repayment**: Repay from wallet balance

#### Credit Score (0-100)
| Factor | Max Points |
|--------|-----------|
| Payment History | 40 |
| Savings Consistency | 20 |
| Agreement Compliance | 20 |
| Dispute Record | 10 |
| Account Age | 10 |

#### Profile & Privacy
- 50+ field tenant profile (personal, academic, professional, family, lifestyle, references, verification)
- Grant, deny, or revoke profile access to landlords and government officials
- Upload profile photo and Ghana Card ID
- Request ID, income, and address verification

#### Disputes
- File disputes against landlords for: rent increase violations, illegal eviction, maintenance failures, deposit refund issues, illegal clauses, other
- Upload evidence (images, videos, documents — up to 5 files, 10MB each)
- Track status: filed → under_mediation → escalated → resolved → closed

#### Other
- Messages: real-time chat with any user
- Notifications: push, email, SMS (configurable)
- Rental laws library: browse housing laws by category
- Blog: read educational articles
- Settings: theme (dark/light/system), language, notification preferences

---

### Landlord

#### Dashboard
- Properties overview with occupancy rate ring chart
- Revenue trend (area chart) with month-over-month change
- Active tenants count, collection rate progress bar
- Pending and overdue payment tracking
- Expiring leases (next 60 days), open disputes
- Alert banners for overdue payments, expiring leases, and maintenance needs

#### Properties
- Create listings with title, description, type, address, rent amount, duration, images (up to 10), amenities, rules
- Set tenant preferences:
  - Minimum credit score, income multiplier
  - Smoking, pets, children policy
  - Age range, max occupants, preferred gender
  - References required, employment proof, profile completeness
- Edit and delete properties
- Publish for government review (must be approved before visible to tenants)
- Status tracking: draft → pending_review → available → occupied / maintenance_required / under_dispute

#### Tenants Management
- View all current and past tenants with full details
- Per-tenant view: active agreements, rent amounts, payment history, last payment, total paid

#### Applications
- View all received applications (pending, approved, rejected, withdrawn)
- Approve applications → auto-creates draft agreement with calculated end date
- Reject with optional notes to tenant

#### Agreements
- Create agreements manually (property, tenant, dates, rent, deposit, advance months, terms)
- Edit drafts (clears existing signatures)
- Sign and countersign agreements
- Decline renewal on active agreements
- System flags illegal clauses ("forfeit deposit", "no refund", "waive rights") and advance > 6 months

#### Payments
- View all received payments with status, amount, date, tenant, and method
- Track pending and overdue amounts

#### Profile Access
- Request to view tenant profiles before accepting applications
- Track approval status per tenant

#### Disputes
- View disputes filed against them
- Receive notifications on status changes
- Cannot update dispute status (government/legal only)

#### Other
- Messages, documents (upload, version, share), notifications
- Credit score lookup for any tenant
- Blog (read only)
- Settings: theme, language, notifications

---

### Property Manager

Same as **Landlord**. Manages properties on behalf of landlords with identical permissions for properties, applications, agreements, tenants, payments, and disputes.

---

### Government

#### Dashboard
- System-wide market health overview:
  - Vacancy rate (available vs occupied)
  - Dispute rate (open disputes vs total properties)
  - Compliance rate (agreements without violations)
  - Payment growth trend (monthly volume change)
  - Overall market health score with critical issue alerts

#### Platform Analytics
- Total users, tenants, landlords by type
- Properties by status, agreements by status
- Total payment volume with monthly breakdown
- Average rent by property type
- Dispute statistics by category and status
- Compliance violations and warnings
- Regional property distribution
- Savings adoption metrics (active savers, total saved, completion rate)

#### Property Management
- Pending review queue — approve or reject listings with detailed reasons
- View all properties regardless of ownership

#### Policy Simulation
- **Rent Cap**: Model impact of rent caps by region/type — affected properties, tenant savings, revenue impact
- **Advance Limit**: Model max advance months — affected agreements, tenant relief
- **Market Health**: Vacancy, dispute, compliance, and payment trend indicators

#### Users Management
- List and view all users in the system
- Create new admin, government, and legal officer accounts
- Update user roles and permissions
- Delete users (except super_admin)

#### Disputes
- View all disputes system-wide
- Update status: filed → under_mediation → escalated → resolved → closed
- Add mediation notes and resolution details

#### Other
- View all agreements and payments across the platform
- Blog creation, editing, and deletion
- Tenant profile access (with approval), credit score lookup
- Documents audit trail
- Notifications and settings

---

### Legal Officer

Same as **Government** with a focus on dispute mediation and resolution. Has access to:
- All disputes with full mediation capabilities
- Platform analytics and user management
- Agreement compliance monitoring
- Policy simulation tools
- Blog management and tenant profile access

---

### Admin / Super Admin

#### Admin
Full system access with delegated capabilities:
- All properties, agreements, payments, disputes, documents
- User management (create, update permissions, delete)
- Platform analytics and policy simulation
- Blog management and property review (approve/reject)

#### Super Admin (Additional)
- Create other super admins
- Grant super admin role to users
- Modify super admin users (only super_admin can modify another super_admin)
- Cannot be deleted by regular admins

#### Permissions System

Fine-grained permissions independent of roles:

| Permission | Capability |
|-----------|-----------|
| `users:create` | Create new users |
| `users:manage_permissions` | Update roles and permissions |
| `users:delete` | Delete users |
| `users:invite` | Send invitations |

---

## Cross-Cutting Features (All Roles)

| Feature | Description |
|---------|------------|
| **Messages** | Real-time chat with any user via Socket.io |
| **Notifications** | In-app, email, SMS, push — all configurable per channel |
| **Rental Laws** | Browse Ghana housing laws and regulations by category |
| **Blog** | Read educational articles (create/edit for gov/admin/legal only) |
| **Theme** | Dark, light, or system preference |
| **Language** | Configurable interface language |
| **Profile Photo** | Upload and update profile picture |
| **Role Switching** | Switch active role if user has multiple roles assigned |

---

## Key Business Logic

### Property Listing Workflow
1. Landlord creates property → **Draft**
2. Landlord publishes → **Pending Review** (government notified)
3. Government approves/rejects → **Available** or rejected
4. Tenants can browse → Only approved properties visible
5. Visibility rule: Occupied properties hidden unless lease ends < 3 months AND tenant indicated non-renewal

### Agreement Lifecycle
1. Tenant applies → Application created
2. Landlord approves → Draft agreement auto-created
3. Both parties sign → **Active** (property marked occupied)
4. Active period → Tenant can make payments
5. At expiry → Either party can indicate non-renewal
6. Compliance checks: advance > 6 months flagged, illegal clauses detected

### Dispute Resolution
1. Tenant files dispute → Property marked **under_dispute**
2. Government notified
3. Government updates: filed → under_mediation → escalated → resolved → closed
4. Both parties notified at each status change
5. Evidence uploaded by either party (images, videos, documents)

### Credit Score Calculation
| Factor | Points | Calculation |
|--------|--------|------------|
| Payment History | 0-40 | % of completed vs total payments |
| Savings Consistency | 0-20 | Active plans and progress |
| Agreement Compliance | 0-20 | Active agreements without violations |
| Dispute Record | 0-10 | Fewer open disputes = higher score |
| Account Age | 0-10 | Months since account creation |

### Property Qualification Check
Tenants see whether they meet landlord preferences:
- Minimum credit score
- Income multiplier (income >= rent x multiplier)
- Smoking, pets, children policy
- Max occupants, preferred gender, age range
- References and employment proof required
- Profile 100% complete

---

## API Route Guards

| Endpoint | Allowed Roles |
|----------|--------------|
| `POST /properties` | Authenticated (landlord) |
| `POST /properties/:id/publish` | Authenticated (landlord) |
| `POST /properties/:id/review` | government, admin |
| `GET /properties/pending-review` | government, admin |
| `POST /agreements` | Authenticated (landlord) |
| `POST /agreements/:id/sign` | Authenticated (landlord or tenant) |
| `GET /agreements/tenants` | landlord, property_manager, admin |
| `POST /payments` | tenant |
| `POST /disputes` | Authenticated (tenant) |
| `PATCH /disputes/:id/status` | government, admin |
| `GET /analytics/platform` | government, admin, legal_officer |
| `GET /users` | government, admin, legal_officer |
| `POST /users` | users:create permission |
| `DELETE /users` | users:delete permission |
| `POST /applications` | tenant |
| `POST /applications/:id/respond` | landlord, property_manager |
| `POST /simulation/*` | government, admin, legal_officer |
| `POST /savings/*` | tenant |
| `POST /loans/apply` | tenant |
| `POST /blog` | admin, government, legal_officer |

---

## License

Proprietary - RentOS Ghana
