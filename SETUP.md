# First-Time Setup Guide

Everything you need to do before the first release build. All steps are doable from your phone browser or GitHub web UI — no local machine required.

---

## Step 1: Generate Your Release Keystore (One-Time)

You need a release keystore to sign production APKs. Generate it using a GitHub Actions workflow:

1. Go to **Actions** → **Generate Release Keystore (Run Once)**
2. Click **Run workflow**
3. Enter a **keystore password** (remember it — you'll need it once more in step 2)
4. Enter a **key password** (can be the same as keystore password)
5. Click **Run workflow**
6. Wait ~1 minute for it to complete
7. Open the completed run → read the **Summary** for instructions

⚠️ **Run this workflow exactly ONCE.** Running it again creates a new keystore that would make your future APKs incompatible with ones already installed.

---

## Step 2: Add GitHub Secrets

After running the keystore workflow, go to:
**Settings → Secrets and variables → Actions → New repository secret**

Add these 4 secrets:

| Secret Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The base64 string from the workflow output |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password you chose |
| `ANDROID_KEY_ALIAS` | `taskmind-key` |
| `ANDROID_KEY_PASSWORD` | The key password you chose |

---

## Step 3: Make the Repository Public (Recommended)

Go to **Settings → General → Danger Zone → Change repository visibility → Public**

This gives you unlimited GitHub Actions minutes. Without it, you have 2000 min/month free.

---

## Step 4: Configure Branch Protection

Go to **Settings → Branches → Add rule** for `main`:
- ✅ Require status checks before merging: `lint`, `test`
- ✅ Require linear history
- ✅ Do not allow bypassing the above settings

---

## Step 5: Create Your First Release

1. Push a tag from the GitHub web UI or via Kiro:
   ```
   git tag v0.1.0-pipeline
   git push --tags
   ```
2. The `build-release.yml` workflow triggers automatically
3. A signed APK appears in **Releases** within ~25 minutes

---

## Installing APKs on Android

1. On your Android device, go to **Settings → Apps → Special App Access → Install Unknown Apps**
2. Allow your browser (Chrome/Firefox) to install unknown apps
3. Tap the APK download link → it installs directly

---

## Getting Help

File a GitHub Issue using the Bug Report template. Always attach a Diagnostics export:
**Open app → Settings → Diagnostics → Export** → attach JSON to the issue.
