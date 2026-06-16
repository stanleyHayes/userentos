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

# Or from mobile/
npx expo start
```

Press `a` for Android emulator, `i` for iOS simulator, or scan QR with Expo Go.

## Environment Variables

| Variable | Description | Dev | Production |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | Backend API URL | `http://localhost:3002/api` | `https://api.rentos.com.gh` |

Set in `eas.json` per build profile, or in a `.env` file for local dev.

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

## Updating the App

### OTA Updates (No Rebuild)

```bash
eas update --branch production --message "Bug fix"
```

Pushes JS bundle updates without requiring a new store submission.

### Full Rebuild

Required when native dependencies change (new Expo SDK, new native modules, etc.).

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
| OTA update | `eas update --branch production` |
