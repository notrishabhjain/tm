# TaskMind

Personal Android task automation app. Auto-captures tasks from notifications. No snooze. Fully offline.

---

## Install the Latest Build

### From a Release (recommended for stable builds)
1. Go to the **[Releases](https://github.com/notrishabhjain/tm/releases)** tab
2. Tap the latest release
3. Download the `.apk` file
4. Tap the APK to install (allow "Install Unknown Apps" if prompted)

### From a Development Build (latest features, may be rough)
1. Go to the **[Actions](https://github.com/notrishabhjain/tm/actions)** tab
2. Tap the latest successful **"Build Debug APK"** run
3. Scroll down to **Artifacts**
4. Tap the artifact to download the ZIP
5. Extract the APK from the ZIP and tap to install

---

## First-Time Setup
1. Install the APK and open TaskMind
2. Grant **Notification Access** when prompted (Settings → Notification Access → TaskMind)
3. Complete the onboarding flow (select apps to monitor, add VIP contacts, configure nudges)
4. You're live — TaskMind will now auto-capture tasks from your notifications

---

## Architecture

| Layer | Tech |
|---|---|
| Framework | React Native 0.79 + Expo SDK 53 |
| Architecture | New Architecture (Fabric + JSI + TurboModules) |
| JS Engine | Hermes V1 |
| Database | expo-sqlite 15 + Drizzle ORM |
| KV Storage | react-native-mmkv (encrypted for secrets) |
| Notifications | Custom native module (Kotlin) + Notifee |
| Routing | Expo Router 4 |
| State | Zustand + TanStack Query |

Full technical specification: [`02_TaskMind_SRS.md`](./02_TaskMind_SRS.md)

---

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md). **Always attach a Diagnostics export** — open Settings → Diagnostics → Export and attach the JSON file to the issue.

---

## Build Status

| Workflow | Status |
|---|---|
| CI (lint + test) | [![CI](https://github.com/notrishabhjain/tm/actions/workflows/ci.yml/badge.svg)](https://github.com/notrishabhjain/tm/actions/workflows/ci.yml) |
| Debug APK | [![Build Debug APK](https://github.com/notrishabhjain/tm/actions/workflows/build-debug.yml/badge.svg)](https://github.com/notrishabhjain/tm/actions/workflows/build-debug.yml) |
