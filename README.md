# TaskMind

Personal Android task automation app. Captures notifications from WhatsApp, SMS, email and more — converts actionable ones into tasks automatically. No snooze. No defer. Just do it.

## Install the Latest Build

### From a release (recommended)

1. Go to the **Releases** tab
2. Tap the latest release
3. Download the `.apk` file
4. Open it to install (allow "Install from Unknown Sources" if prompted)

### From a development build

1. Go to the **Actions** tab
2. Tap the latest successful **Build Debug APK** run
3. Scroll to **Artifacts** section
4. Tap to download the ZIP
5. Extract the APK from the ZIP and tap to install

## First-Time Setup

1. Install the APK and open TaskMind
2. Complete the onboarding flow
3. Grant **Notification Access** when prompted (Settings → Notification Access → TaskMind → Allow)
4. Select which apps to monitor
5. Add VIP contacts whose messages always create urgent tasks
6. Configure nudge timing

## Reporting Issues

Open a [bug report](../../issues/new?template=bug_report.md). Attach the **Diagnostics export** from Settings → Diagnostics → Export button — this gives all the context needed to diagnose without needing local access.

## Architecture

- **Stack**: React Native 0.76 + Expo 52 (Development Build), TypeScript strict, Expo Router
- **Database**: Drizzle ORM + expo-sqlite (JSI-based, offline-first)
- **State**: Zustand + TanStack Query
- **Notifications**: Custom Expo Module wrapping Android NotificationListenerService
- **New Architecture**: Enabled (JSI + Fabric + TurboModules)

See [SRS](./02_TaskMind_SRS.md) for full technical specification.

## Development

All builds happen in GitHub Actions — no local development environment required.

```bash
# The user workflow:
# 1. Kiro makes changes in a feature branch
# 2. CI (ci.yml) runs lint + tests
# 3. build-debug.yml produces an APK artifact
# 4. User downloads APK from Actions tab and installs on device
# 5. User files issues on GitHub
```

## Generating a Release Keystore (one-time setup)

1. Go to **Actions** tab
2. Find **Generate Release Keystore** workflow
3. Click **Run workflow**
4. Enter keystore password and key password
5. Copy the base64 output from the step summary
6. Add it as `ANDROID_KEYSTORE_BASE64` in Settings → Secrets → Actions
7. Add the other 3 secrets: `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
