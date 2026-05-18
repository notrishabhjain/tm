# CI/CD Pipeline Specification

## TaskMind — GitHub Actions Build Pipeline

| Field                | Value                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| **Document Version** | 1.0                                                                         |
| **Date**             | May 18, 2026                                                                |
| **Author**           | RJ                                                                          |
| **Target Audience**  | Kiro Agent                                                                  |
| **Constraint**       | User has no local development machine. ALL builds happen in GitHub Actions. |

---

## 1. Purpose & Scope

This document specifies the complete CI/CD pipeline for TaskMind. Because the user has no local development environment, GitHub Actions is the **sole** environment that:

- Installs dependencies
- Runs linters and tests
- Builds APKs
- Signs and publishes releases

The user's workflow is:

1. Review and merge Kiro's PRs from a browser (phone or borrowed computer).
2. CI builds an APK.
3. User downloads APK from GitHub Actions artifacts or Releases.
4. User installs APK on Android device.
5. User tests on device, files feedback in GitHub Issues.
6. Repeat.

Kiro must design the pipeline to make this loop fast, reliable, and self-diagnosing.

---

## 2. Core Principles

### 2.1 Use Local EAS Builds in CI

Use `eas build --platform android --profile <name> --local` running on GitHub-hosted Linux runners. This bypasses the EAS Build cloud quotas (15 Android builds/month on free tier) entirely. You get effectively unlimited builds on GitHub Actions' free minutes (2000/month for private repos, unlimited for public).

### 2.2 Fast Feedback

Every push to a branch must produce CI results within 25 minutes. Long iteration loops kill productivity. Optimize aggressively via caching.

### 2.3 Self-Service for the User

The user cannot debug locally. The CI must produce APKs that are easy to find, easy to install, and clearly labeled. Workflow logs must be readable on a phone.

### 2.4 Reproducible Builds

Same commit → same APK. Lock all dependency versions. Pin Node, JDK, and Gradle versions. Use a `.tool-versions` file for clarity.

### 2.5 Secrets Hygiene

Release keystore, SMTP credentials for test reports, and any other secrets live ONLY in GitHub Secrets. Never in code, never in artifacts.

---

## 3. Repository Setup

### 3.1 Required GitHub Secrets

| Secret Name                 | Purpose                                              | Required For   |
| --------------------------- | ---------------------------------------------------- | -------------- |
| `ANDROID_KEYSTORE_BASE64`   | Release keystore, base64-encoded                     | Release builds |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                                    | Release builds |
| `ANDROID_KEY_ALIAS`         | Key alias inside keystore                            | Release builds |
| `ANDROID_KEY_PASSWORD`      | Key password                                         | Release builds |
| `EXPO_TOKEN`                | Expo access token (only if using EAS cloud features) | Optional       |

Recommend generating the keystore once and storing it. Kiro should provide a script `scripts/generate-keystore.sh` for the user (or a paired developer) to run once via GitHub Codespaces (free tier) since the user has no local machine.

### 3.2 Repository Settings

- **Visibility:** Public (recommended). Reasons:
  - Unlimited GitHub Actions minutes
  - Easier APK distribution (anyone with the URL can download)
  - No risk: no credentials in code
- **Branch protection on `main`:**
  - Require status checks: `lint`, `test`, `build-debug`
  - Require linear history (rebase or squash only)
  - No direct pushes to main (all changes via PR)
- **Auto-delete merged branches:** enabled
- **Actions permissions:** Read and write (needed to create Releases)

### 3.3 Required Files at Repo Root

```
.github/
├── workflows/
│   ├── ci.yml               # Lint + tests on every push & PR
│   ├── build-debug.yml      # Debug APK build (on push, main + feature branches)
│   ├── build-release.yml    # Signed release APK + GitHub Release (on tag)
│   └── nightly.yml          # Optional: nightly debug build on main
├── ISSUE_TEMPLATE/
│   ├── bug_report.md
│   └── feature_request.md
└── pull_request_template.md
.tool-versions               # Node, JDK, Gradle versions
.gitignore
.gitattributes
README.md
SETUP.md                     # First-time setup instructions
```

---

## 4. Workflow: `ci.yml` — Lint and Test

Runs on every push and pull request. Fast feedback only — no APK build here.

```yaml
name: CI

on:
  push:
    branches-ignore: ['main']
  pull_request:
    branches: ['main']

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.tool-versions'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run Prettier check
        run: npm run format:check

      - name: TypeScript type check
        run: npm run typecheck

  test:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.tool-versions'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm test -- --coverage --maxWorkers=2

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7

      - name: Coverage threshold check
        run: npm run test:coverage-check
```

**Notes for Kiro:**

- `npm ci` is preferred over `npm install` for reproducibility.
- `--maxWorkers=2` keeps memory usage manageable on free runners.
- Coverage thresholds are configured in `jest.config.js` and enforced via the `test:coverage-check` script.

---

## 5. Workflow: `build-debug.yml` — Debug APK Builds

Triggers on every push to any branch (after lint+test pass). Produces a debug APK as an artifact the user can download and install.

```yaml
name: Build Debug APK

on:
  push:
    branches: ['**']
  workflow_dispatch: # Manual trigger from GitHub UI

concurrency:
  group: build-debug-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: Build Debug APK
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.tool-versions'
          cache: 'npm'

      - name: Setup JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ runner.os }}-${{ hashFiles('android/**/*.gradle*', 'android/**/gradle-wrapper.properties') }}
          restore-keys: gradle-${{ runner.os }}-

      - name: Setup Expo and EAS
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest

      - name: Install dependencies
        run: npm ci

      - name: Generate version info
        id: version
        run: |
          echo "short_sha=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
          echo "branch=$(echo ${GITHUB_REF#refs/heads/} | tr '/' '-')" >> $GITHUB_OUTPUT
          echo "build_time=$(date -u +%Y%m%d-%H%M)" >> $GITHUB_OUTPUT

      - name: Build debug APK
        run: |
          eas build \
            --platform android \
            --profile development \
            --local \
            --non-interactive \
            --output ./taskmind-debug.apk

      - name: Rename APK with metadata
        run: |
          mv ./taskmind-debug.apk \
             ./taskmind-debug-${{ steps.version.outputs.branch }}-${{ steps.version.outputs.short_sha }}.apk

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: taskmind-debug-${{ steps.version.outputs.branch }}-${{ steps.version.outputs.short_sha }}
          path: ./taskmind-debug-*.apk
          retention-days: 30

      - name: Summary
        run: |
          echo "## 📱 Debug APK Build Complete" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Branch:** \`${{ steps.version.outputs.branch }}\`" >> $GITHUB_STEP_SUMMARY
          echo "**Commit:** \`${{ steps.version.outputs.short_sha }}\`" >> $GITHUB_STEP_SUMMARY
          echo "**Built:** \`${{ steps.version.outputs.build_time }} UTC\`" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### How to install:" >> $GITHUB_STEP_SUMMARY
          echo "1. Scroll down to **Artifacts** section on this page" >> $GITHUB_STEP_SUMMARY
          echo "2. Tap the artifact to download the ZIP" >> $GITHUB_STEP_SUMMARY
          echo "3. Extract the APK from the ZIP" >> $GITHUB_STEP_SUMMARY
          echo "4. Open the APK to install (allow 'Install Unknown Apps' if prompted)" >> $GITHUB_STEP_SUMMARY
```

**Notes:**

- `eas build --local` is the magic flag that runs the build entirely on the GitHub runner, bypassing EAS cloud quotas.
- The `Summary` step writes user-friendly instructions to the workflow summary, which the user sees when checking the build on their phone.
- APK retention is 30 days — long enough for testing iterations, short enough to not hit storage quotas.

---

## 6. Workflow: `build-release.yml` — Signed Release Builds

Triggers on tag push (`v*`). Builds, signs, and creates a GitHub Release.

```yaml
name: Build Release APK

on:
  push:
    tags: ['v*']

jobs:
  build-release:
    name: Build & Sign Release APK
    runs-on: ubuntu-latest
    timeout-minutes: 35
    permissions:
      contents: write # Required to create releases

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.tool-versions'
          cache: 'npm'

      - name: Setup JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ runner.os }}-${{ hashFiles('android/**/*.gradle*') }}

      - name: Setup Expo and EAS
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest

      - name: Install dependencies
        run: npm ci

      - name: Decode keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
        run: |
          echo "$KEYSTORE_BASE64" | base64 -d > ./android/app/release.keystore

      - name: Extract version from tag
        id: version
        run: |
          echo "tag=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT
          echo "version=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Build release APK
        env:
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          eas build \
            --platform android \
            --profile production \
            --local \
            --non-interactive \
            --output ./taskmind-${{ steps.version.outputs.tag }}.apk

      - name: Verify APK is signed
        run: |
          $ANDROID_HOME/build-tools/34.0.0/apksigner verify \
            --verbose ./taskmind-${{ steps.version.outputs.tag }}.apk

      - name: Generate release notes
        id: notes
        run: |
          # Extract changelog section for this version
          awk "/## \[${{ steps.version.outputs.version }}\]/{flag=1; next} /## \[/{flag=0} flag" CHANGELOG.md > release-notes.md
          if [ ! -s release-notes.md ]; then
            echo "Release ${{ steps.version.outputs.tag }}" > release-notes.md
          fi

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.version.outputs.tag }}
          name: TaskMind ${{ steps.version.outputs.tag }}
          body_path: release-notes.md
          files: ./taskmind-${{ steps.version.outputs.tag }}.apk
          draft: false
          prerelease: false

      - name: Clean up keystore
        if: always()
        run: rm -f ./android/app/release.keystore
```

**Notes:**

- The keystore is decoded from base64 GitHub secret at build time and deleted after.
- The signed APK is verified before release using `apksigner verify`.
- Release notes are extracted from CHANGELOG.md automatically.
- Tagging convention: `v1.0.0`, `v1.1.0-rc1`, etc.

---

## 7. Workflow: `nightly.yml` (Optional)

Nightly debug build on `main` to catch silent regressions.

```yaml
name: Nightly Build

on:
  schedule:
    - cron: '0 18 * * *' # 23:30 IST daily
  workflow_dispatch:

jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      # ... same steps as build-debug.yml ...
      # Upload artifact with "nightly-YYYY-MM-DD" name
```

---

## 8. EAS Build Configuration (`eas.json`)

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleDebug"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      }
    },
    "production": {
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      },
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Notes:**

- `"distribution": "internal"` because no Google Play Store distribution.
- `buildType: "apk"` (not "aab") because user installs directly.
- `appVersionSource: "local"` because version comes from `app.json`, not EAS managed.

---

## 9. App Configuration (`app.json`)

Key fields Kiro must set up:

```json
{
  "expo": {
    "name": "TaskMind",
    "slug": "taskmind",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "android": {
      "package": "com.taskmind.app",
      "versionCode": 1,
      "permissions": [
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.READ_CALENDAR",
        "android.permission.WRITE_CALENDAR",
        "android.permission.SCHEDULE_EXACT_ALARM",
        "android.permission.INTERNET"
      ],
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0A2540"
      }
    },
    "plugins": [
      "expo-router",
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 28,
            "compileSdkVersion": 34,
            "targetSdkVersion": 34
          }
        }
      ],
      "./modules/notification-listener"
    ]
  }
}
```

---

## 10. Local Tool Versions (`.tool-versions`)

```
nodejs 20.18.0
java temurin-17.0.10+7
```

Use `asdf` or `mise` semantics — these tools are auto-detected by GitHub Actions setup actions.

---

## 11. NPM Scripts (`package.json`)

```json
{
  "scripts": {
    "start": "expo start --dev-client",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage-check": "jest --coverage --coverageThreshold='{\"global\":{\"lines\":70,\"functions\":70,\"branches\":60}}'",
    "test:e2e": "detox test",
    "build:android:debug": "eas build --platform android --profile development --local",
    "build:android:release": "eas build --platform android --profile production --local",
    "prebuild": "expo prebuild --platform android --clean",
    "db:generate": "drizzle-kit generate:sqlite",
    "db:seed": "tsx scripts/seed-db.ts"
  }
}
```

---

## 12. PR Template (`.github/pull_request_template.md`)

```markdown
## Feature ID

<!-- e.g., F-04 -->

## What's in this PR

<!-- 2-3 sentence summary -->

## FR-IDs Implemented

<!-- List FR-XX-NN IDs from SRS -->

## Definition of Done Checklist

- [ ] All linked FR-IDs implemented
- [ ] Tests added (unit + integration where applicable)
- [ ] Lint, typecheck, format all clean
- [ ] No hardcoded strings (uses i18n)
- [ ] No hardcoded colors/spacing (uses theme tokens)
- [ ] Accessibility verified
- [ ] CHANGELOG.md updated under [Unreleased]
- [ ] Self-tested with debug APK from CI

## Testing Notes

<!-- How should RJ test this? Specific scenarios? -->

## Screenshots / Recordings

<!-- For UI features. Attach screenshots or screen recording. -->

## Out of Scope

<!-- Anything explicitly NOT in this PR that someone might expect -->
```

---

## 13. Bug Report Template (`.github/ISSUE_TEMPLATE/bug_report.md`)

```markdown
---
name: Bug Report
about: Report a bug found while testing an APK
labels: bug
---

## APK Version

<!-- From About screen, or filename: e.g., taskmind-debug-main-a1b2c3d.apk -->

## Device Info

- **Device:** <!-- e.g., Redmi Note 12 -->
- **Android version:** <!-- e.g., Android 13 -->

## What happened

<!-- Steps to reproduce -->

## What I expected

<!-- -->

## What actually happened

<!-- -->

## Diagnostics Export

<!-- If applicable: open Settings → Diagnostics → Export and attach JSON file -->
```

---

## 14. README.md Template

Kiro must produce a README that the user can read on their phone. Key sections:

```markdown
# TaskMind

Personal Android task automation app.

## How to Install the Latest Build

### From a release (recommended)

1. Go to **Releases** tab
2. Tap the latest release
3. Download the `.apk` file
4. Open it to install

### From a development build

1. Go to **Actions** tab
2. Tap the latest successful "Build Debug APK" run
3. Scroll to **Artifacts**
4. Tap to download the ZIP
5. Extract the APK and tap to install

## First-Time Setup

1. Install the APK
2. Allow "Install from Unknown Sources" if prompted
3. Open TaskMind
4. Grant Notification Access when asked
5. Complete the onboarding flow

## Reporting Issues

Open an issue using the Bug Report template. Include the Diagnostics export from Settings → Diagnostics.

## Architecture

See [SRS.md](./02_TaskMind_SRS.md) for the full technical specification.
```

---

## 15. Caching Strategy

To hit the <25 minute build target consistently:

| Cache       | Path                                           | Key                         |
| ----------- | ---------------------------------------------- | --------------------------- |
| npm         | `~/.npm` + `node_modules`                      | `package-lock.json` hash    |
| Gradle      | `~/.gradle/caches`, `~/.gradle/wrapper`        | `android/**/*.gradle*` hash |
| EAS CLI     | `~/.eas`                                       | EAS version                 |
| Android SDK | Provided by `android-actions/setup-android@v3` | n/a                         |

Cache hit rate should be ≥70% across CI runs. Monitor in early sprints; tune cache keys if needed.

---

## 16. Failure Diagnosis Without Local Access

Critical: when CI fails, the user cannot reproduce locally. Mitigations:

1. **Verbose CI logs.** Every step prints what it's doing. No silent failures.
2. **Failure summaries.** Failed jobs write a `$GITHUB_STEP_SUMMARY` block with: what failed, where, and likely next step.
3. **Artifact uploads on failure.** Always upload Gradle/Metro logs as artifacts when builds fail:
   ```yaml
   - name: Upload failure logs
     if: failure()
     uses: actions/upload-artifact@v4
     with:
       name: failure-logs
       path: |
         android/app/build/reports/
         /tmp/metro-*.log
   ```
4. **In-app Diagnostics screen.** Bundled with every build, accessible from Settings. Allows exporting:
   - Recent notification events captured
   - Extraction decisions (matched keywords, scores, decisions)
   - Discarded log
   - DB stats
   - Device info
   - App version + commit hash
5. **Crash reporting (offline).** Use a JS-side crash handler (e.g., `react-native-exception-handler`) that writes crash dumps to local storage. User can export via Diagnostics screen.

---

## 17. Versioning Strategy

- **Semantic versioning** for tags: `v0.1.0`, `v1.0.0`, `v1.2.3-rc1`.
- **`version` in app.json:** matches tag (without `v` prefix).
- **`android.versionCode`:** monotonically increasing integer, auto-incremented by CI on each release.
- **Commit SHA** included in debug APK filename and in-app About screen for traceability.

---

## 18. First-Time Pipeline Setup Checklist (for Kiro)

When scaffolding the project, Kiro must complete this checklist:

- [ ] Initialize Expo project with TypeScript template
- [ ] Configure New Architecture in app.json
- [ ] Create all 3 workflow files in `.github/workflows/`
- [ ] Create `.tool-versions` with Node 20+ and JDK 17
- [ ] Create `.gitignore` with proper Expo/RN entries (especially `android/`, `ios/`, `keystore`, `.env`)
- [ ] Create `.gitattributes` with line ending normalization
- [ ] Create README.md with install instructions
- [ ] Create SETUP.md explaining how to generate keystore via GitHub Codespaces
- [ ] Create `scripts/generate-keystore.sh` script
- [ ] Set up Jest config with coverage thresholds
- [ ] Set up ESLint, Prettier, TypeScript strict mode
- [ ] Run `expo prebuild` once to generate android folder
- [ ] Commit android folder for custom native module access
- [ ] Configure Husky pre-commit hook? **NO** — user has no local env, so pre-commit hooks are pointless. All quality gates live in CI.

---

## 19. Cost & Quota Monitoring

- **GitHub Actions minutes (public repo):** Unlimited. Recommended.
- **GitHub Actions minutes (private repo):** 2000/month free. A single debug build is ~10 min, so ~200 builds/month. Tight if iterating heavily.
- **GitHub Actions storage:** 500 MB free for artifacts. Each APK is ~30-50 MB. With 30-day retention, this fills up. Use lifecycle rules + manual cleanup of old artifacts.
- **EAS Build cloud usage:** $0/month. We're using `--local`, not EAS cloud.

If repo must be private and quota becomes an issue, the user can upgrade to GitHub Pro ($4/month) for 3000 minutes.

---

## 20. Open Questions for Kiro to Confirm

1. Should the user host the keystore generation script for a one-time use via GitHub Codespaces, or generate it inside a workflow on first release?
2. Should debug APKs include a watermark or "DEBUG" label in the splash screen to avoid confusion with release builds?
3. Should the Diagnostics screen require a hidden tap-gesture to access, or be always visible in Settings?
4. Confirm: keep iOS-related code out of the repo entirely to reduce complexity? (Recommendation: yes, since iOS notification access is restricted anyway.)
