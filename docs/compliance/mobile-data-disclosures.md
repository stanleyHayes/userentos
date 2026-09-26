# Native data disclosure evidence

Status: engineering inventory, 13 September 2026. This document is not a submitted App Store Connect privacy label or Google Play Data safety form. The app-level declarations live in `apps/mobile/app.json` under `expo.ios.privacyManifests`. Release owners must reconcile the final binary, server configuration, SDK disclosures and actual processor arrangements before submission.

## Confirmed app flows

All categories below can be associated with a signed-in account. Apple manifest entries therefore declare linkage. No cross-company advertising identifier or tracking SDK was found in the inspected mobile source/dependencies; the app-level manifest declares no tracking. That finding requires revalidation for the release binary and enabled service providers.

| Data | Source evidence | Use and disclosure mapping |
| --- | --- | --- |
| Name, email and phone | `apps/mobile/app/auth/register.tsx`, `settings.tsx`, `employer.tsx` | Account creation, contact, employer profiles and account security. Apple Name/EmailAddress/PhoneNumber; Play personal info. |
| Physical address | `add-property.tsx`, `employer.tsx`, `my-business.tsx` | Property, employer and business addresses, including GhanaPost digital addresses. Apple PhysicalAddress; Play Address. A typed property address is not proof of GPS collection. |
| Payment information | `(tabs)/payments.tsx`, `(tabs)/savings.tsx` | Payment method and mobile-money phone submitted to RentOS. Apple PaymentInfo; Play user payment info. Do not exempt this data merely because card entry may occur at an external processor. |
| Credit information | `tenant-passport.tsx`; API `models/CreditScore.ts`, `controllers/analyticsController.ts` | Account-linked credit/rental evaluation and reporting. Apple CreditInfo; Play Credit score. Accuracy, lawful use and regulated-service review remain separate open requirements. |
| Other financial information | `tenant-profile.tsx`, `financing.tsx`, `financier.tsx`, `employer.tsx`, `loans.tsx`, `investments.tsx`, `(tabs)/savings.tsx` | Income, employment/payroll amounts, financing applications, debts, savings and investments. Apple OtherFinancialInfo; Play Other financial info. Functionality and account/operational reporting. |
| Messages | `chat/[id].tsx`, `(tabs)/messages.tsx`; API `models/Conversation.ts` | Sender, recipient and message content are processed by the service; moderation can access reported content. Apple EmailsOrTextMessages; Play Other in-app messages. This does not mean access to a device's SMS inbox. |
| Photos | `add-property.tsx`, image upload via `lib/api.ts` | User-selected property images uploaded to the service. Apple PhotosorVideos; Play Photos. No video capture or photo-library-wide harvesting is implemented by this flow. |
| Support and safety reports | `chat/[id].tsx`, `disputes.tsx`; API `models/ContentReport.ts` | User complaints, report reasons and dispute content. Apple CustomerSupport and OtherUserContent; Play Other user-generated content. |
| Other user content | `tenant-profile.tsx`, `maintenance.tsx`, `property/[id].tsx`, `local-services.tsx`, `legal-assistant.tsx`, `ai-writer.tsx`, `components/AITextInput.tsx` | Bios, descriptions, reviews, maintenance requests, AI prompts and supplied documents/text. Apple OtherUserContent; Play Other user-generated content, with Files and docs needing final upload-flow reconciliation. The six external AI routes and semantic-search endpoint now require a per-request sharing acknowledgement; web/native clients ask before sending. Background embedding and other provider transfers still require review. |
| User IDs | `stores/authStore.ts`, `components/AppleBillingSession.ios.tsx`, `components/GoogleBillingSession.android.tsx` | Account IDs and store account bindings associate actions and subscriptions with users. Apple UserID; Play User IDs. |
| Device IDs | `lib/biometric.ts`, `lib/push.ts`; API `models/RefreshToken.ts` | App-generated device identity/label, push registration and session metadata. Apple DeviceID; Play Device or other IDs. Local biometric success is not a biometric template sent to RentOS. |
| Purchase history | `subscription.tsx`, `(tabs)/payments.tsx`; API store journals and `controllers/analyticsController.ts` | Subscription and rent transaction history, restoration and financial reports. Apple PurchaseHistory; Play Purchase history. |
| Product interaction | `saved-properties.tsx`, `notifications.tsx`, `chat/[id].tsx`; API `models/Favorite.ts`, `controllers/analyticsController.ts` | Saved properties, read states and recorded workflow actions. Apple ProductInteraction; Play App interactions/Other actions. Operational reporting uses some of these records. |
| Searches | `(tabs)/properties.tsx`, `local-services.tsx`, `auth/register.tsx` | Search criteria sent to the API and saved search preferences. Apple SearchHistory; Play In-app search history. Retention and ephemeral-processing answers must match endpoint/cache/log behavior. |
| Other personal data | `auth/register.tsx`, `tenant-profile.tsx`; API `models/RefreshToken.ts`, `models/AuditLog.ts` | Optional Ghana Card ID, demographic/profile details and IP/security metadata. Apple OtherDataTypes; Play Other personal info and relevant identifiers. Exact government-ID retention and access controls remain under review. |

### Changes since 13 September (25 September 2026)

- **Regulated financial features are off in production by default** (`REGULATED_FEATURES`, see [regulated-features.md](regulated-features.md)). While they are off, the app shows no rent payment, wallet, savings, loans, investments, insurance, financing, payroll or credit score screens, and the API refuses those requests. So no Payment information, Credit information or the financial parts of Other financial information are collected. Answer the store forms for the configuration you actually ship. If you enable a feature, update the forms in the same release that discloses it.
- **Consent evidence.** Accepting the Terms and Privacy Policy stores the document versions, time, IP address, user agent and 18+ confirmation, for account security and to prove consent. Apple: Other data types. Play: Other info. Account deletion erases these fields.
- **Ghana Card / national ID numbers** are encrypted at rest (AES-256-GCM). Landlords with approved profile access see only whether ID was reviewed and the last four digits, never document or selfie images.
- **Shared tenant passports** no longer include the tenant's email or exact lifetime payment total.
- **Reports** can now be made on listings, reviews, business and service-provider profiles as well as messages and users. Objectionable text in messages and reviews is filtered on submission, and borderline text creates an automated report.
- **Push permission** is requested only after the user chooses to turn notifications on.
- **Notification preferences** are enforced server-side. Optional categories respect the user's email, SMS and push choices, and optional emails carry a manage-preferences link.

### Paid placements and advertising (26 September 2026)

RentOS has two paid placements: sponsored property listings and paid "featured" businesses in Local Services. Both are served only when a screen asks for them (`placement=search_top` on `GET /properties`, `placement=directory` on `GET /businesses`), and **the Android and iOS apps never ask**. The mobile apps therefore show no paid placements; the web browse and Local Services pages do, labelled "Sponsored".

- Choosing a sponsored item uses only the placement and the request's own city filter, never the user, device, profile, history or location (`services/marketplace/sponsorshipServing.ts`; `sponsorship-serving.test.ts` pins the signatures). Impressions are one aggregate counter per campaign; there is no per-view record and no click tracking.
- New-mover offers are no longer targeted using the user's lease. They are shown to everyone with a "For new movers" tag. Businesses get only a weekly count of new leases per city (sent at 5 or more), with no agreement, property or tenant reference.
- `com.google.android.gms.permission.AD_ID` is blocked in `app.json` (`blockedPermissions`). No advertising, attribution or analytics SDK is linked; `NSPrivacyTracking` is false with no tracking domains.
- Registry and storefront visitor counts on the web use a keyed hash that changes daily (`utils/visitorHash.ts`); neither is collected from the apps.

Resulting answers, for the configuration above:

| Question | Answer |
| --- | --- |
| Apple: data used to track you | No, for every data type. No App Tracking Transparency prompt or `NSUserTrackingUsageDescription`. |
| Apple: Third-Party Advertising purpose | Not ticked for any data type. |
| Apple: Developer's Advertising or Marketing purpose | Not ticked for any data type. The apps show no ads and RentOS sends users no marketing. The weekly lease count goes to business owners in-app as a service notice about their own listing. |
| Apple: Advertising Data (Usage Data) | Not collected. |
| Apple: Search History | Keep App Functionality and Product Personalization (saved search preferences). |
| Google: Does your app contain ads? | **No.** The Android app never receives sponsored listings or featured-business boosts. |
| Google: Advertising ID | No (not used; permission removed from the merged manifest). |
| Google Data safety: "Advertising or marketing" purpose | Not selected for any data type. Nothing is shared for advertising. |

If a mobile screen ever sends a placement parameter, all of the following change in the same release: Google "Contains ads" becomes Yes (a public label on the listing), these answers must be revisited, and the privacy policy sentence "The RentOS mobile apps do not show paid placements" must be removed. The screens already render the Sponsored label, so the code change is one parameter; the declarations are the real work.

Apple functionality purposes cover features, account security and user-requested transactions. Analytics purposes are included for records used by existing operational reports. Personalization covers saved preferences and profile-based matching. These declarations do not authorize those uses or settle their lawfulness.

## Decisions required before store submission

- Review provider disclosures and production configuration for Cloudinary, Expo push/APNs/FCM, AI providers, payment processors, identity partners and any observability service. Identify processing countries, retention, subcontractors and deletion support. A processor's operation is not automatically exempt from Play's sharing questions.
- Reconcile recipient sharing: public listings/reviews, chat participants, property applicants/landlords, employers, financing partners, moderators and user-triggered passport sharing. Apply the relevant store definition to each flow; do not answer “no sharing” globally from the absence of an advertising SDK.
- ~~Resolve contextual sponsored placements and aggregate impression recording.~~ Resolved 26 September 2026: the apps show no paid placements; see "Paid placements and advertising" above for the final answers. Before submitting, confirm on the EAS release AAB (`bundletool dump manifest`) that `AD_ID` is absent, and re-check that no release-enabled provider links data across companies.
- Determine whether profile-derived/coarse location, financial documents, optional sensitive content and operational diagnostics add categories beyond this inventory. Removed religion/ethnicity form fields are not proof that every older server record or free-text input contains no sensitive data.
- Specify required versus optional collection for every role and flow. Registration data required for an account differs from optional photo uploads, notifications, biometric enrollment and financing applications. Record the store's applicable answer for the complete distributed app.
- Verify production transport security end to end, not just the application's HTTPS base URL. Do not claim independent security certification. Local development uses HTTP and is not release evidence.
- Verify in-app export/deletion, the deployed public deletion URL, operational mailbox and retention exceptions. Existing engineering supports requests; backup/provider erasure and statutory retention classification remain open.
- Generate an Xcode archive privacy report and review all SDK manifests/required-reason API declarations. App configuration does not replace SDK manifests, privacy labels or Play Console answers. Final signed release artifacts must contain the declarations.
- Review deployed privacy policy and just-in-time disclosures against this inventory, including the new per-request AI disclosure and remaining background/indirect provider transfers. Record the accountable legal entity, Ghana data-controller registration, contact and processors using verified operational facts.

## Primary policy references

Checked 13 September 2026: [Apple collected data values](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype), [Apple manifest guidance](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests), [Expo 55 app configuration](https://docs.expo.dev/versions/v55.0.0/config/app/) and [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469). Store definitions govern the final answers; the matrix above is an engineering interpretation of current code.
