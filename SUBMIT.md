# App Store & Play Store Submission Guide

## Prerequisites

| Item | Cost | Link |
|------|------|------|
| Apple Developer Account | $99/yr | https://developer.apple.com/programs |
| Google Play Developer Account | $25 one-time | https://play.google.com/console |
| GitHub Account | Free | https://github.com |

## 1. Deploy the Backend

Before the mobile apps work, the backend must be live on a public server.

```bash
# Follow DEPLOY.md to deploy to Railway / Render / VPS
# After deploying, note your backend URL (e.g. https://myapp.onrender.com)
```

## 2. Configure for Your Backend

Once deployed, update the API URL:

```bash
# Edit mobile-config.json with your real backend URL
# e.g. { "apiUrl": "https://myapp.onrender.com" }

# Then run:
npm run mobile:sync
```

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/budget-tracker.git
git push -u origin main
```

## 4. Android: Google Play Store

### 4a. Generate Keystore (one-time)

```bash
# Requires Java JDK 17+ installed
# Download from: https://adoptium.net/
node scripts/generate-keystore.js
```

### 4b. Build Release AAB via GitHub Actions

1. Go to your GitHub repo → **Actions** → **Build Mobile Apps**
2. Click **Run workflow** → select **release** environment
3. The workflow builds a signed AAB and uploads it as an artifact

Alternatively, build locally:

```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### 4c. Upload to Google Play Console

1. Go to https://play.google.com/console
2. **Create app** → set name "Budget Tracker", category Finance
3. Fill in store listing (use `metadata/google/metadata.json` as template)
4. **Production** → **Create new release**
5. Upload the `app-release.aab` file
6. Fill in "What's new in this release?" → "Initial release"
7. **Save** → **Review release** → **Start rollout to Production**

### 4d. Screenshots

Take screenshots of these screens in an Android emulator:

- **Dashboard** (summary cards + chart)
- **Transactions** (list with categories)
- **Budgets** (budget cards with progress bars)
- **Settings** (PayPal section)

Upload at least 2 phone screenshots (6.5" display recommended).

## 5. iOS: Apple App Store

### 5a. Prerequisites (macOS only)

- Xcode 15+ (install from Mac App Store)
- Apple Developer account ($99/yr)

### 5b. Create App in App Store Connect

1. Go to https://appstoreconnect.apple.com
2. **Apps** → **+** → **New App**
3. Platform: **iOS**, Name: **Budget Tracker**
4. Bundle ID: select `com.yourcompany.budgettracker`
5. SKU: `BT_2_0_0`

### 5c. Create Certificates & Profiles

In Xcode (or Apple Developer Portal):

1. Xcode → **Settings** → **Account** → sign in with Apple ID
2. **Manage Certificates** → **+** → **Apple Distribution**
3. Go to https://developer.apple.com → **Certificates, IDs & Profiles**
4. Create **App ID** with bundle `com.yourcompany.budgettracker`
5. Create **App Store Distribution Profile** → download and install

### 5d. Build & Upload via Xcode

```bash
npm run mobile:ios   # Syncs + opens Xcode
```

In Xcode:
1. Select **App** target → **Signing & Capabilities**
2. Check **Automatically manage signing** (or select your provisioning profile)
3. Select destination: **Any iOS Device**
4. **Product** → **Archive**
5. When archive completes, click **Distribute App**
6. **App Store Connect** → **Upload**
7. Wait for upload → go back to App Store Connect

### 5e. Submit for Review

1. In App Store Connect → fill in app info:
   - Description (use `metadata/apple/metadata.json`)
   - Keywords, support URL, privacy policy URL
   - Screenshots (same ones from Android)
   - App Review contact info
2. Select the build you just uploaded
3. **Submit for Review**

### 5f. Build via GitHub Actions (alternative)

The workflow in `.github/workflows/build.yml` can build iOS, but **signing** requires your certificates. To set up:

1. Export your Apple Distribution certificate as `.p12`
2. Base64 encode and add to GitHub Secrets:
   - `APPLE_DIST_CERT_B64`
   - `APPLE_DIST_CERT_PASS`
   - `APPLE_PROVISIONING_PROFILE_B64`
3. Then the CI can sign and build a distributable IPA

## 6. Post-Submission Checklist

- [ ] Backend deployed and accessible via HTTPS
- [ ] App icons generated (already done — see `assets/`)
- [ ] Screenshots taken for both stores
- [ ] Privacy policy URL created (see template below)
- [ ] Support email set up
- [ ] `mobile-config.json` updated with real backend URL

### Privacy Policy Template

Create a page at `https://your-backend.com/privacy` with:

> **Privacy Policy for Budget Tracker**
>
> Budget Tracker stores your email, name, and transaction data securely on our servers.
> We do not share your personal data with third parties.
> Payment processing is handled by PayPal. See PayPal's privacy policy for details.
> You can request deletion of your account and data at any time by contacting support@your-backend.com.

## 7. Troubleshooting

| Issue | Solution |
|-------|----------|
| PayPal not loading in mobile app | Enable Mixed Content in Android WebView settings, or ensure backend serves HTTPS |
| API calls failing | Check `mobile-config.json` has the correct backend URL, and CORS is configured on the backend |
| Build fails on GitHub Actions | Ensure secrets are configured for signing |
| App rejected for login requirement | Provide a demo account or test credentials for App Review |
