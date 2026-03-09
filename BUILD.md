# Least Count - Android App Build Guide

## Quick Start

### 1. Configure Firebase (Required)

**Option A: GitHub Actions (Automatic Builds)**
1. Go to Firebase Console → Project Settings → Add app → Android
2. Package name: `com.leastcount.game`
3. Download `google-services.json`
4. Add the file content as a GitHub secret:
   - Go to your repo → Settings → Secrets → New repository secret
   - Name: `GOOGLE_SERVICES_JSON`
   - Value: Paste the entire contents of google-services.json

**Option B: Local Development**
1. Download `google-services.json` from Firebase Console
2. Place in: `android/app/google-services.json`

### 2. Build

**Local Build:**
```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```
APK location: `android/app/build/outputs/apk/debug/`

**GitHub Actions:**
1. Push to main branch or manually run workflow
2. Go to Actions → "Build Android APK" → Run workflow
3. Download APK from Artifacts

## Features
- Single-player vs AI (1-3 bots)
- Multiplayer via room codes
- Drag & drop card reordering
- 30-second turn timer
- Auto-skip on timer expiry
- Declare/show when score < 7
- PWA support for installable app

## App Configuration
- App ID: `com.leastcount.game`
- Min SDK: 24 (Android 7.0)
- Target SDK: 36
