# Mobile App Guide (Capacitor)

This project uses [Capacitor](https://capacitorjs.com) to wrap the web frontend as a native iOS and Android app.

## Prerequisites

- **iOS**: macOS + Xcode 15+
- **Android**: Android Studio + Android SDK 34+

## Setup

```bash
npm install
```

## Configuration

1. **Deploy the backend** to a public server first (see [DEPLOY.md](DEPLOY.md)).
2. Edit `mobile-config.json` and set `apiUrl` to your deployed backend URL:
   ```json
   { "apiUrl": "https://your-app.com" }
   ```

## Build & Sync

```bash
# Sync web assets to native platforms (replaces API_BASE, copies, then restores)
npm run mobile:sync

# Or sync + open native IDE:
npm run mobile:ios     # macOS only
npm run mobile:android
```

## Open in IDE & Build

### iOS
```bash
npx cap open ios
```
Then in Xcode: select a team, build to simulator or device, Archive → Distribute App → App Store Connect.

### Android
```bash
npx cap open android
```
Then in Android Studio: Build → Generate Signed Bundle / APK → upload to Play Console.

## Important Notes

- The app loads web UI **locally** from the device but makes API calls to your backend server.
- Push notifications and biometric auth can be added with Capacitor plugins later.
- Update the `appId` in `capacitor.config.json` to your real bundle identifier before publishing (e.g. `com.yourcompany.budgettracker`).
- The PayPal SDK loads from the web at runtime (user needs internet).

## Updating After Changes

After changing any files in `public/`:
```bash
npm run mobile:sync
```
Then rebuild in Xcode / Android Studio.
