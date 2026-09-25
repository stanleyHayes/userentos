# Regulated features (Ghana)

Written for: whoever operates a RentOS deployment and decides which financial services it offers.

Several RentOS features are regulated activities in Ghana. Code alone can't make them lawful. Each needs the operator to hold the licence, or a licensed partner to perform the activity. Until that is true, the feature must stay off.

## What the gate does

The API reads two kinds of environment variable:

- `REGULATED_FEATURES` lists the features to offer, comma-separated.
- `REGULATED_BASIS_<FEATURE>` records the licence or partner agreement relied on for each one.

Behaviour by environment:

- **Production** (`NODE_ENV=production`): nothing is enabled unless listed. The API refuses to start if a listed feature has no basis recorded.
- **Development and tests**: everything is enabled unless `REGULATED_FEATURES` is set.

When a feature is off:

- Its routes return `403` with `code: "FEATURE_UNAVAILABLE"` before any handler runs.
- Scheduled savings auto-debits don't run.
- Web and mobile hide the navigation entries. Opening a disabled screen directly, by deep link or notification tap, shows "This service isn't available".

Clients read `GET /api/platform/features`. If they can't get a complete answer, they treat every regulated feature as off.

Payment history, receipts and agreements stay available whatever the settings, so users keep access to their records.

## Features and the law they touch

| Feature | What it covers | Law to check | Evidence to record as the basis |
|---|---|---|---|
| `rent_collection` | Collecting rent into the platform's provider account, crediting landlord balances and paying out | Payment Systems and Services Act 2019 (Act 987); BoG licensing | BoG licence number, or a licensed PSP agreement that settles funds directly to landlords (e.g. split settlement) |
| `wallet` | Stored balances, deposits, savings plans, withdrawals | Act 987; Banks and Specialised Deposit-Taking Institutions Act 2016 (Act 930) | BoG e-money or partner licence reference |
| `lending` | Platform micro-loans | BoG digital credit directive; Borrowers and Lenders Act 2020 (Act 1052) | Lender licence, or partner lender agreement |
| `financing` | Third-party rent advances and deposit loans | Act 1052; Rent Act 1963 (Act 220) s.25 advance limits | Each financier's licence, verified; platform role agreed with counsel |
| `investments` | Investment products | Securities Industry Act 2016 (Act 929); SEC fintech directive | SEC licence, or licensed partner agreement |
| `insurance` | Selling policies and handling claims | Insurance Act 2021 (Act 1061); NIC | NIC licence of each insurer or agent, and the platform's intermediary status |
| `payroll` | Employer salary deductions for repayments | Labour Act 2003 (Act 651); Act 1052 | Legal review of the deduction mandate model |
| `credit_reporting` | Computing credit scores and sharing them with landlords and financiers | Credit Reporting Act 2007 (Act 726); Data Protection Act 2012 (Act 843) s.41 | Licensed bureau partnership or legal opinion; consent and human-review process |

## Before enabling a feature

1. Get the licence or partner agreement, and legal sign-off on RentOS's role.
2. Set `REGULATED_FEATURES` and the matching `REGULATED_BASIS_<FEATURE>` on the API, then redeploy.
3. For the mobile apps, submit a store update whose review notes and store listing disclose the feature. Apple guideline 2.3.1 forbids enabling undisclosed features after review. Apple 3.2.1(viii) and 5.1.1(ix) and Google Play's Financial Services policy (including the personal-loan declaration and its minimum 61-day repayment term) apply to loans, investments and insurance.
4. Update the privacy notice and Terms if the feature adds processors or data uses.

Estate agency is not gated here. Its obligation is per agent: a verified REAC licence under the Real Estate Agency Act 2020 (Act 1047). That check is tracked in `COMPLIANCE_AUDIT.md`.
