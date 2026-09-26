# Mobile App — Build & Deployment

## Tech Stack

- **Framework:** Expo SDK 55 + React Native 0.83
- **Routing:** Expo Router (file-based)
- **State:** Zustand + TanStack Query
- **Build:** EAS Build (cloud) or local Gradle/Xcode

## Local Development

```bash
# From project root
npm run dev:mobile

# Or from apps/mobile/
npx expo start
```

Press `a` for Android emulator, `i` for iOS simulator, or scan the QR code with Expo Go.

Expo Go is fine for screens and API work, but it cannot exercise the native-only
paths: in-app purchases (expo-iap is not in Expo Go) and Android remote push.
Test those on a development build or a `preview`/`production` build (see
[Development builds](#development-builds)).

## Environment Variables

| Variable | Description | Dev | Production |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | Backend origin; the app appends `/api` | unset, or `http://<your computer's LAN IP>:3002` | `https://api.userentos.com` |
| `GOOGLE_SERVICES_JSON` | Path to Firebase `google-services.json` (Android push); an EAS **file** variable | not needed | required for Android push, see [Android push](#android-push-firebase) |

`EXPO_PUBLIC_API_URL` is set per build profile in `eas.json`, or in a `.env` file
for local dev. Do not include `/api`. Left unset in development, the app uses the
Expo dev server's host on port 3002, so a physical phone reaches your computer.

## Prerequisites

| Platform | Requirement |
|---|---|
| **Android** | Android Studio + SDK, Java 17 (JDK) |
| **iOS** | Xcode (macOS only), Apple Developer account (for device builds) |
| **Both** | Node.js, EAS CLI (`npm i -g eas-cli`) |

> **Important:** Java 17 is required for Android builds. If you have a newer JDK, set `org.gradle.java.home` in `android/gradle.properties` to point to your Java 17 installation.

---

## Android

### Local APK Build

```bash
# 1. Generate native project
npx expo prebuild --clean --no-install

# 2. Build release APK
cd android
./gradlew assembleRelease

# 3. APK location
# android/app/build/outputs/apk/release/app-release.apk
```

Share the `.apk` file directly — recipients install it on their Android device (enable "Install from unknown sources").

### EAS Cloud Build (APK)

```bash
# Login to Expo
eas login

# Build APK for sharing
eas build --platform android --profile preview
```

EAS returns a download link when the build completes.

### EAS Production Build (AAB for Play Store)

```bash
eas build --platform android --profile production
```

Produces an `.aab` for upload to Google Play Console.

### Google Play Store

1. Create a developer account at [play.google.com/console](https://play.google.com/console) ($25 one-time)
2. Create a new app and fill in the store listing
3. Upload the `.aab` from the production build
4. Complete content rating, pricing, and distribution
5. Submit for review

---

## iOS

### Simulator Build (No Apple Developer Account)

```bash
npx expo prebuild --clean --no-install
npx expo run:ios
```

Runs on the iOS Simulator only.

### EAS Cloud Build (Internal Distribution)

```bash
# Register test devices first
eas device:create

# Build for internal distribution
eas build --platform ios --profile preview
```

Requires an Apple Developer account ($99/year). Testers install via a link.

### EAS Production Build (App Store)

```bash
eas build --platform ios --profile production
```

### Submit to App Store

```bash
eas submit --platform ios
```

Or upload the `.ipa` manually via [Transporter](https://apps.apple.com/app/transporter/id1450874784) or Xcode.

### TestFlight

1. Build with `production` profile
2. Submit with `eas submit --platform ios`
3. In [App Store Connect](https://appstoreconnect.apple.com), add testers to TestFlight
4. Testers install via the TestFlight app

---

## EAS Build Profiles

Defined in `eas.json`:

| Profile | Use Case | Android Output | Distribution |
|---|---|---|---|
| `preview` | Internal testing/sharing | `.apk` | Direct install |
| `production` | Store release | `.aab` | Google Play / App Store |

Both profiles point at the production API (`https://api.userentos.com`).

### Development builds

A development build is the app with the Expo dev menu, so native modules
(purchases, push, Face ID) run while JS reloads from `npx expo start`. It needs
`expo-dev-client`, which is not installed yet:

```bash
npx expo install expo-dev-client
```

Then add a profile to `eas.json`:

```json
"development": {
  "developmentClient": true,
  "distribution": "internal"
}
```

and build it with `eas build --profile development --platform ios|android`.

### Preview against a staging API

There is no staging API yet, so `eas.json` has no staging profile. Once one
exists, add a profile that extends `preview` and overrides only the URL:

```json
"preview-staging": {
  "extends": "preview",
  "env": { "EXPO_PUBLIC_API_URL": "https://<staging API host>" }
}
```

Use it for device testing that must not touch production data, including
App Store sandbox and Play test purchases.

### Local native folders

`ios/` and `android/` are generated (continuous native generation) and
gitignored, so EAS cloud builds regenerate them. `npx expo run:*` and
`eas build --local` use whatever folders already exist, so an old folder builds
an old manifest. Always run `npx expo prebuild --clean` first.

## Android push (Firebase)

Android push tokens come from Firebase Cloud Messaging, so an Android build
without Firebase configuration cannot register for push (iOS is unaffected).

1. In the Firebase console, create a project and add an Android app with the
   package name `gh.rentos.mobile`. Download `google-services.json`.
2. Upload it as an EAS file environment variable:

   ```bash
   eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
   ```

   When prompted, pick the environments the builds use (`preview` for the
   internal-distribution profile, `production` for store builds) and the
   `secret` visibility.

   `app.config.ts` passes its path to `android.googleServicesFile`. For a local
   build, putting the file at `apps/mobile/google-services.json` also works; it is
   gitignored.
3. Upload the FCM V1 service-account key so Expo's push service can send to
   Android: `eas credentials` > Android > production > Google Service Account >
   FCM V1.
4. Build, sign in on a phone, allow notifications and check the API logs
   `POST /api/push/register 200`.

The notification icon is `assets/notification-icon.png` (white on
transparent, set on the `expo-notifications` plugin).

## Updating the App

Every change ships as a new build. Over-the-air updates (`eas update`) are not
set up: the app does not include `expo-updates`, so an `eas update` would never
reach installed apps.

To add them later, deliberately: `npx expo install expo-updates`, choose a
`runtimeVersion` policy in `app.json`, run `eas update:configure`, then ship a
new store build. Only builds made after that can receive updates.

---

## Quick Reference

| Task | Command |
|---|---|
| Start dev server | `npx expo start` |
| Build Android APK locally | `cd android && ./gradlew assembleRelease` |
| Build Android APK (cloud) | `eas build -p android --profile preview` |
| Build iOS (simulator) | `npx expo run:ios` |
| Build iOS (device, cloud) | `eas build -p ios --profile preview` |
| Submit to Play Store | `eas submit -p android` |
| Submit to App Store | `eas submit -p ios` |
