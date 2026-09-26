# App Store and Google Play submission guide

Written for: the person submitting RentOS to App Store Connect and the Google Play Console.

This reflects the code at the commit that added it. Store rules change, so recheck the linked policies before each submission. The data-type answers live in [mobile-data-disclosures.md](mobile-data-disclosures.md), and the rules for regulated features are in [regulated-features.md](regulated-features.md).

## App identity

| Item | Value |
|---|---|
| Bundle ID / package | `gh.rentos.mobile` |
| Version | `apps/mobile/app.json` → `version`. Build numbers are managed remotely by EAS and auto-increment on production builds (`eas.json`). |
| Export compliance | `usesNonExemptEncryption: false`. Only standard HTTPS/TLS and OS crypto are used. |
| Privacy policy URL | `https://userentos.com/privacy` |
| Support URL | `https://userentos.com/support` |
| Account deletion URL (Google Play) | `https://userentos.com/delete-account` |
| Marketing URL | `https://userentos.com` |

## Before you submit

1. **Production API configuration.**
   - `PAYMENTS_PROVIDER_MODE=live` (simulated mode is refused in production).
   - `PII_ENCRYPTION_KEY` is set, and `src/scripts/encryptPiiFields.ts` has been run once.
   - `REGULATED_FEATURES` is empty unless a licence or partner agreement is recorded for each listed feature (see [regulated-features.md](regulated-features.md)).
2. **Legal identity.** Set `LEGAL_ENTITY` in `packages/shared/types/index.ts` to the registered company name, registration number and DPC registration number (see `apps/api/DEPLOYMENT.md`). Deploy the web app so `/privacy`, `/terms`, `/data-protection`, `/support` and `/delete-account` are live.
3. **Monitored mailboxes.** `support@userentos.com` and `info@userentos.com` must be read daily. The Terms promise moderation action within 24 hours of a report and human review of automated decisions.
4. **Signed build privacy report.** Build with EAS, then open the Xcode archive's privacy report. Check that the declared data types match the disclosure inventory.
5. **Permission strings.** The app never records audio or uses the camera, so it ships without microphone or camera usage strings. But `expo-audio` and `expo-image-picker` link code that references those APIs. If App Store Connect returns an ITMS-90683 warning or rejection, add honest strings through the plugins' `microphonePermission` and `cameraPermission` options. No prompt is ever shown, because the app never calls those APIs.
6. **Demo accounts.** Prepare them in production, as described below.

## Demo accounts for App Review

Reviewers need accounts that already hold data. Create them through the normal flows in production, so they're subject to the same rules as real users:

1. Register **reviewer-landlord@** and **reviewer-tenant@** addresses you control, accepting the Terms. Use strong unique passwords, and don't turn on MFA for these accounts.
2. As the landlord, create one property with photos.
3. As an admin, approve the listing. Also mark the landlord's identity as reviewed; only do this after checking a document, or use an internal test identity.
4. As the tenant, apply to the property. As the landlord, approve the application.
5. Both accounts sign the generated agreement.
6. Send a couple of chat messages between them.

Enter both accounts' credentials in the review information. Give Google the same through **App access**.

## Review notes (paste into App Store Connect / Play Console)

> RentOS helps tenants and landlords in Ghana find homes, apply, sign tenancy agreements and communicate. Sign in with the demo tenant or landlord account provided.
>
> - Account deletion: Profile → Edit Profile → "Privacy, data export and account deletion" → type DELETE. It is also available at https://userentos.com/delete-account.
> - User-generated content: messages, listings, reviews, business and service-provider profiles can be reported from their menus, and users can be blocked from a chat. Objectionable text in messages and reviews is filtered on submission. Reports reach a moderation queue that is actioned within 24 hours. The Terms of Service (accepted at sign-up) prohibit objectionable content.
> - Digital subscriptions (landlord listing plans) are sold only through In-App Purchase, with restore and manage options. Rent and real-world services are paid outside the app to the landlord or provider.
> - AI features (legal information assistant, writing help) ask for permission each time before any text is sent to a third-party AI provider. Their answers are general information, not legal advice.
> - Payments, stored balances, lending, investments and insurance are not offered in this version. The server keeps them switched off until RentOS or a licensed partner holds the required Ghanaian licences. Enabling any of them will come in a future update that discloses it for review.

Remove the last bullet if a regulated feature is ever enabled, and describe that feature, its licensed provider and its terms instead.

## Store declarations

**Both stores**
- **Sign in with Apple:** not required. There is no third-party or social login (email/password, optional TOTP, device biometrics).
- **Tracking:** none. There are no advertising or tracking SDKs, so App Tracking Transparency is not needed.
- **Ads:** the apps show none. Sponsored listings and paid featured businesses are served only when a screen asks for them, and only the website asks (details and the full answer table: [mobile-data-disclosures.md](mobile-data-disclosures.md#paid-placements-and-advertising-26-september-2026)).
- **Age.** The Terms require users to be 18 or older, and sign-up requires confirming it.
  - Apple: choose the 18+ age rating.
  - Google: set the target audience to 18+.
  - Declare user-generated content and user-to-user messaging in the content questionnaires.

**Google Play**
- **Financial features declaration:** answer that the app offers none while every regulated feature is off. If lending is ever enabled, file the Personal Loans declaration. The code enforces a minimum 3-month term, shows APR including fees and the total cost of credit, and names the lender.
- **Ads (App content → Ads):** "Does your app contain ads?" **No**. The Android app never requests paid placements, so it never receives a sponsored listing or a featured-business boost.
- **Advertising ID:** No. `com.google.android.gms.permission.AD_ID` is in `app.json` `blockedPermissions`; check it is absent from the release AAB's merged manifest (`bundletool dump manifest`) before answering.
- **Data safety:** use [mobile-data-disclosures.md](mobile-data-disclosures.md). Data is encrypted in transit. Users can delete their account in the app (Settings → Privacy) and ask for deletion on the web (`/delete-account`). Listings and profiles come down at once and the rest of the account data is deleted after 30 days; tenancy, payment, regulated-service and moderation records and the 2-year security log are kept for legal reasons. So answer that users can request deletion and that some data is retained for legal reasons. Select "Advertising or marketing" for no data type; nothing is shared for advertising.
- **Permissions:**
  - Photos use the system photo picker, so no storage permission.
  - Camera, microphone, storage, media and overlay permissions are blocked in `app.json`.
  - Notifications are requested only after the user chooses to turn them on.
  - Biometrics are used only to unlock the stored sign-in.
- **Target API level:** Expo SDK 55 / React Native 0.83 targets the current required level.

**App Store**
- **App Privacy:** "Used to track you": No for every data type. Tick neither Third-Party Advertising nor Developer's Advertising or Marketing for any data type, and do not declare Advertising Data. No App Tracking Transparency prompt.
- **Guideline 5.1.2(i) (sharing personal data with AI):** consent is asked per request, as described in the review notes.
- **Guidelines 3.2.1(viii) and 5.1.1(ix) (regulated financial services):** not applicable while the regulated features are off. If one is enabled, the developer account holder must be the licensed institution or show its partnership.

## Policies checked

[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) · [Google Play ads declaration](https://support.google.com/googleplay/android-developer/answer/9859455) · [Google Play Advertising ID](https://support.google.com/googleplay/android-developer/answer/6048248) · [Apple age ratings](https://developer.apple.com/help/app-store-connect/reference/age-ratings) · [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111) · [Google Play Financial Services policy](https://support.google.com/googleplay/android-developer/answer/9876821) · [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937) · [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
