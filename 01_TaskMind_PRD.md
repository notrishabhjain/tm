# Product Requirements Document (PRD)

## TaskMind — Personal Task Automation App for Android

| Field                | Value                                         |
| -------------------- | --------------------------------------------- |
| **Document Version** | 2.0                                           |
| **Date**             | May 18, 2026                                  |
| **Author**           | RJ                                            |
| **Status**           | Approved for Development                      |
| **Target Platform**  | Android (React Native, single-user, personal) |
| **Development Tool** | Kiro Agent                                    |
| **Build Pipeline**   | GitHub Actions only (no local IDE)            |

---

## 1. Executive Summary

TaskMind is a personal, offline-first Android application designed to combat procrastination by automatically converting incoming notifications, WhatsApp messages, and meeting transcripts into actionable tasks. The app eliminates the cognitive overhead of manually capturing tasks and removes the ability to snooze — forcing immediate engagement with pending work.

The app learns from user behavior to progressively improve task detection accuracy in both English and Hindi (including Hinglish), becoming more intelligent over time without ever sending data off-device.

This project is built using React Native (the primary user has prior MERN stack experience) and uses GitHub Actions as the sole build environment. The user does not have a local development machine capable of running Android Studio or React Native build tooling. All APKs are produced as CI artifacts that the user installs directly on their Android device.

---

## 2. Problem Statement

### 2.1 The Problem

Tasks arrive through multiple digital channels — WhatsApp, email, SMS, work chat apps, and meetings — but they rarely make it into a structured task management system. Manual entry creates friction, leads to forgotten commitments, and enables procrastination through deferral mechanisms like snooze.

### 2.2 Personal Pain Points

- Most actionable items arrive via WhatsApp in mixed Hindi/English language.
- Existing task apps require manual entry, which is rarely done in real-time.
- Snooze and reminder-deferral features enable procrastination.
- Meeting action items are lost because transcripts are not actively reviewed.
- Off-the-shelf solutions send data to the cloud, raising privacy concerns.

### 2.3 Why Existing Solutions Fail

- **Todoist / TickTick / Microsoft To Do** — require manual input, no notification parsing, cloud-dependent.
- **Google Tasks** — minimal automation, no language understanding.
- **AI assistants (Bixby, Google Assistant)** — cloud-based, no persistent enforcement, weak Hindi support.

---

## 3. Goals & Objectives

### 3.1 Primary Goals

1. **Eliminate manual task capture** for 80%+ of incoming actionable messages.
2. **Force engagement with pending work** by removing snooze and using non-dismissible notifications.
3. **Maintain absolute data privacy** through offline-only operation.
4. **Support bilingual task detection** (English + Hindi + Hinglish) with on-device intelligence.
5. **Build and ship entirely through CI** without requiring a local development environment.

### 3.2 Success Metrics

| Metric                                  | Target                                     |
| --------------------------------------- | ------------------------------------------ |
| Task detection accuracy                 | ≥85% after 2 weeks of use                  |
| False positive rate                     | ≤10% on confirmed tasks                    |
| Daily task completion rate              | ≥60% of created tasks                      |
| Time from notification to task creation | <3 seconds (RN bridge overhead acceptable) |
| App crash-free sessions                 | ≥99%                                       |
| CI build success rate                   | ≥95%                                       |
| CI build duration                       | <25 minutes end-to-end                     |
| Learned vocabulary growth               | ≥5 new phrases per week of active use      |

### 3.3 Non-Goals

- Multi-user accounts or team collaboration.
- Cloud sync across devices.
- iOS support (Android only; iOS notification access is far more restrictive and would require a separate strategy).
- Snooze, defer, or "remind me later" functionality.
- Two-way calendar synchronization.
- Direct messaging from within the app.
- Local development environment requirements.

---

## 4. Target User

**Single Primary User:** RJ — a project manager who:

- Has MERN stack background, comfortable with JavaScript/TypeScript.
- Receives most actionable communications via WhatsApp in English/Hindi/Hinglish.
- Manages multiple stakeholders and deadlines simultaneously.
- Values privacy and prefers on-device intelligence over cloud-based AI.
- Does not have access to a local computer capable of running Android Studio.
- Will install and test APKs directly on their Android device from CI artifacts.

---

## 5. User Personas & Use Cases

### 5.1 Primary Use Cases

**UC-01: WhatsApp Message from Manager**

- _Trigger:_ User receives WhatsApp message "kal tak report bhej dena please" from a VIP contact.
- _Expected Behavior:_ Task auto-created with URGENT priority, no confirmation prompt, persistent notification updates to reflect new urgent task.

**UC-02: Vague Group Chat Message**

- _Trigger:_ User receives WhatsApp message "anyone has the file?" in a group chat from a non-VIP contact.
- _Expected Behavior:_ App detects low confidence (~0.45), creates task with `needsConfirmation=true`, shows confirmation prompt.

**UC-03: Meeting Action Items**

- _Trigger:_ After a meeting, user pastes a 30-minute transcript into the Import Transcript screen.
- _Expected Behavior:_ App parses transcript, extracts 5–10 candidate tasks, shows reviewable list. User keeps 6, discards 4, adjusts priorities, saves.

**UC-04: Anti-Procrastination Nudge**

- _Trigger:_ User has 3 pending tasks, 1 URGENT. 30 minutes pass with no action.
- _Expected Behavior:_ Nudge notification fires (URGENT override is 15 min). User has no snooze option — must complete, delete, or open the app.

**UC-05: Daily Status Visibility**

- _Trigger:_ 9:00 PM daily.
- _Expected Behavior:_ Email report sent to user with today's completion stats, pending items grouped by priority, source breakdown.

**UC-06: Calendar Commitment**

- _Trigger:_ User reviews a task "Call vendor about pricing" and decides it needs a scheduled slot.
- _Expected Behavior:_ User taps "Add to Calendar", picks tomorrow 11:00 AM, saves. Calendar event created with task details in description.

**UC-07: CI Build and Install**

- _Trigger:_ Kiro pushes a new feature to the main branch.
- _Expected Behavior:_ GitHub Actions workflow runs lint, tests, builds an APK, attaches it as a workflow artifact. User downloads APK to phone, installs it, and tests on real device.

### 5.2 User Journey: First-Time Setup

1. User downloads APK from GitHub Actions artifact via phone browser.
2. Enables "Install from Unknown Sources" for browser.
3. Installs APK.
4. Opens app → splash screen.
5. Onboarding screen 1: Concept explanation (no snooze, offline, learns from you).
6. Onboarding screen 2: Grant Notification Access permission (deep-links to system settings).
7. Onboarding screen 3: Select apps to monitor (defaults pre-checked).
8. Onboarding screen 4: Add VIP contacts (names only, manual entry).
9. Onboarding screen 5: Configure nudge frequency and quiet hours.
10. Onboarding screen 6: Optional — configure email report.
11. Onboarding screen 7: Optional — download intelligence model (~50 MB ONNX).
12. Land on empty Home screen with welcome card.

---

## 6. Feature Requirements

### 6.1 Feature Priority Matrix

| Feature ID | Feature Name                                 | Priority | Phase |
| ---------- | -------------------------------------------- | -------- | ----- |
| F-01       | Notification Listener Engine (native module) | P0       | 1     |
| F-02       | Rule-Based Task Extraction                   | P0       | 1     |
| F-03       | Task CRUD (Complete/Delete/Edit)             | P0       | 1     |
| F-04       | Persistent Non-Dismissible Notification      | P0       | 1     |
| F-05       | Priority System (4 levels)                   | P0       | 1     |
| F-06       | VIP Contact Auto-Urgent                      | P0       | 2     |
| F-07       | Confirmation Flow for Ambiguous Tasks        | P0       | 2     |
| F-08       | Periodic Nudges (Customizable)               | P0       | 2     |
| F-09       | History View with Filters                    | P0       | 2     |
| F-10       | Calendar Integration                         | P1       | 3     |
| F-11       | Meeting Transcript Import                    | P1       | 3     |
| F-12       | CSV/JSON Export & Import                     | P1       | 3     |
| F-13       | Daily Email Report                           | P1       | 3     |
| F-14       | On-Device ML Model (ONNX Runtime)            | P2       | 4     |
| F-15       | Sender Reputation Tracking                   | P2       | 4     |
| F-16       | Learned Vocabulary System                    | P2       | 4     |
| F-17       | Learned Vocabulary Management UI             | P2       | 4     |
| F-18       | Discarded Log / Debug View                   | P3       | 5     |
| F-19       | Automated Weekly Backup                      | P3       | 5     |
| F-20       | OEM Battery Whitelist Guide                  | P3       | 5     |
| F-CI-01    | GitHub Actions Build Pipeline                | P0       | 0     |
| F-CI-02    | Automated Testing in CI                      | P0       | 0     |
| F-CI-03    | APK Artifact Publication & Signing           | P0       | 0     |

### 6.2 Detailed Feature Descriptions

#### F-CI-01: GitHub Actions Build Pipeline

- **Description:** Complete CI/CD pipeline that builds the Android APK on every push and on tagged releases. No local builds required.
- **Acceptance Criteria:**
  - Workflow triggers on push to main, push to feature branches, and on tag creation matching `v*`.
  - Uses `eas build --local` on GitHub-hosted runners to bypass EAS Build cloud quotas.
  - Caches node_modules, Gradle, and EAS CLI between runs.
  - Total build time under 25 minutes.
  - Produces signed APK on release tags using secrets stored in GitHub.
  - Workflow logs are detailed enough to diagnose failures without local reproduction.

#### F-CI-02: Automated Testing in CI

- **Description:** Tests run automatically on every push and block merging on failure.
- **Acceptance Criteria:**
  - Jest unit tests run with code coverage ≥70% on extraction and domain layers.
  - ESLint + Prettier + TypeScript strict-mode checks pass.
  - Detox E2E tests run on Android emulator in CI for critical flows (post-MVP).
  - Test results published as a workflow check.
  - PRs with failing tests cannot be merged.

#### F-CI-03: APK Artifact Publication & Signing

- **Description:** Every successful main-branch or tagged build produces a downloadable APK.
- **Acceptance Criteria:**
  - APK uploaded as GitHub Actions artifact with 30-day retention for branch builds.
  - Tagged releases create GitHub Releases with permanent APK attachments.
  - Release builds signed with a release keystore stored in GitHub secrets.
  - Debug builds use a debug keystore committed to the repo.
  - APK filename includes version, commit hash, and build type.

#### F-01: Notification Listener Engine

- **Description:** Native Android module (Kotlin) bridged to JavaScript that captures all incoming notifications and forwards them to the JS layer via Headless JS.
- **Acceptance Criteria:**
  - Captures package name, title, text, big text, timestamp, and group-chat indicator.
  - Honors user's monitored-apps allowlist (filter applied in native layer for performance).
  - Survives device reboot via `BOOT_COMPLETED` receiver.
  - Handles ≥50 notifications/minute without dropping events.
  - Forwards events to JS via Headless JS task even when app is killed.
- **Note:** This requires writing a custom native module because the existing `react-native-android-notification-listener` package has not been updated for the New Architecture in over 2 years. See SRS Section 3.4 for the rationale and implementation plan.

#### F-02: Rule-Based Task Extraction

- **Description:** Initial keyword + pattern matching system that converts notification text into structured task data. Implemented in TypeScript for testability.
- **Acceptance Criteria:**
  - Ships with 200+ seed keywords across English/Hindi/Hinglish.
  - Categorizes keywords by intent (imperative, urgency, deadline, anti-pattern).
  - Returns confidence score [0.0, 1.0] for every input.
  - Suppresses task creation when anti-patterns dominate.
  - Pure functions, fully unit-testable with no native dependencies.

#### F-03: Task CRUD

- **Description:** Core lifecycle operations on tasks. Notably, no snooze.
- **Acceptance Criteria:**
  - Mark Complete moves task to history with timestamp.
  - Delete is soft-delete (30-day retention for learning signal).
  - Edit supports text, priority, due date changes.
  - All operations reflect instantly in UI via Zustand state and reactive subscriptions to the local DB.

#### F-04: Persistent Non-Dismissible Notification

- **Description:** Always-on status notification showing pending task summary, implemented via a foreground service started from the notification listener service.
- **Acceptance Criteria:**
  - Cannot be swipe-dismissed when ≥1 pending task exists.
  - Shows count of pending tasks and count of URGENT.
  - Provides Open and Mark-Top-Done quick actions.
  - Auto-hides only when zero pending tasks.
  - Updates within 1 second of any task state change.

#### F-05: Priority System

- **Description:** Four-tier priority with rule-based auto-assignment and manual override.
- **Acceptance Criteria:**
  - URGENT / HIGH / MEDIUM / LOW levels supported.
  - VIP sender → automatic URGENT.
  - Urgency keywords → automatic URGENT or HIGH.
  - User can manually change priority of any task.

#### F-06: VIP Contact Auto-Urgent

- **Description:** Configurable list of senders whose messages always create URGENT tasks without confirmation.
- **Acceptance Criteria:**
  - User can add/remove VIP contacts manually.
  - Match performed on notification title (sender name).
  - Case-insensitive substring match.
  - VIP messages skip confirmation flow entirely.

#### F-07: Confirmation Flow

- **Description:** For low-confidence task detections, prompt user before committing.
- **Acceptance Criteria:**
  - Tasks with confidence 0.40–0.75 enter confirmation queue.
  - User sees a heads-up notification with Yes/No.
  - "Confirmation Inbox" screen shows pending confirmations.
  - User decision is a learning signal.

#### F-08: Periodic Nudges

- **Description:** Configurable recurring reminders for pending tasks via Notifee scheduled triggers.
- **Acceptance Criteria:**
  - Frequency options: 15min / 30min / 1hr / 2hr / 4hr / off.
  - Quiet hours configurable (start–end time).
  - URGENT priority can override quiet hours (toggle).
  - Per-priority nudge frequency override available.

#### F-09: History View

- **Description:** Completed and deleted task archive with filtering.
- **Acceptance Criteria:**
  - Filter by time range, status, source app, priority.
  - Show stats header (totals, completion rate, top source).
  - Search by text within history.

#### F-10: Calendar Integration

- **Description:** One-way push of tasks to Android Calendar using `expo-calendar`.
- **Acceptance Criteria:**
  - "Add to Calendar" action on every task.
  - Pre-fills event with task text and source context.
  - Stores returned calendar event ID for back-reference.
  - Requires READ/WRITE_CALENDAR permission.

#### F-11: Meeting Transcript Import

- **Description:** Paste meeting transcripts, get reviewable task list.
- **Acceptance Criteria:**
  - Accepts text input up to 50,000 characters.
  - Segments text by sentence/utterance.
  - Higher confidence threshold than notifications (transcripts are noisier).
  - User reviews list before batch save.
  - Source app set to "Meeting Transcript".

#### F-12: Export & Import

- **Description:** Data portability via CSV/JSON files using `expo-file-system` and `expo-sharing`.
- **Acceptance Criteria:**
  - Export formats: CSV and JSON.
  - Export scopes: All / Pending / History / Date range.
  - Import validates schema, shows preview.
  - Merge by ID or replace-all options on import.

#### F-13: Daily Email Report

- **Description:** Automated daily summary email sent via a native module that wraps Android's `Intent.ACTION_SEND` with attachment support, OR a JS-side SMTP client.
- **Acceptance Criteria:**
  - User-configurable SMTP server, credentials, recipient.
  - Send time configurable, default 9:00 PM.
  - Report includes: summary, completed list, pending list (by priority), source breakdown.
  - Retries on connectivity failure.
- **Implementation Note:** JS-side SMTP is preferred for offline-first goal — uses `react-native-smtp-mailer` or equivalent.

#### F-14: On-Device ML Model

- **Description:** Quantized intent classifier for TASK vs NOT_TASK detection, run via `onnxruntime-react-native`.
- **Acceptance Criteria:**
  - Model size ≤50 MB after quantization (INT8).
  - Inference latency <500ms on mid-range device (RN bridge adds overhead).
  - Downloaded once at setup; never phones home after.
  - Combined with rule layer via weighted score (default 50/50).

#### F-15: Sender Reputation

- **Description:** Per-sender confidence adjustment based on historical user actions.
- **Acceptance Criteria:**
  - Tracks per-sender: created, confirmed, deleted, completed counts.
  - High confirm-rate senders get score boost.
  - High reject-rate senders get score penalty.
  - Independent of VIP list (additive).

#### F-16: Learned Vocabulary

- **Description:** Adaptive expansion of trigger keyword set based on user behavior.
- **Acceptance Criteria:**
  - Extracts n-grams from confirmed-task source text.
  - Promotes to active vocabulary after frequency ≥3 with no contradictions.
  - Demotes phrases that correlate with deletions.
  - Logs to `learned_keywords` table with weights.

#### F-17: Learned Vocabulary UI

- **Description:** User-facing view of what the app has learned, with manual override.
- **Acceptance Criteria:**
  - Lists all active learned phrases with frequency.
  - User can manually remove any learned phrase.
  - Shows demoted phrases in a separate section.

#### F-18: Discarded Log

- **Description:** Capped log of messages discarded by extractor for debugging. Critical given no local debugger.
- **Acceptance Criteria:**
  - Rolling log capped at 500 entries.
  - Shows discarded text, timestamp, confidence score, reason.
  - User can manually promote discarded item to task.
  - Exportable as JSON for offline analysis.

#### F-19: Automated Backup

- **Description:** Weekly auto-export of full database.
- **Acceptance Criteria:**
  - Runs weekly via `expo-background-fetch` or `react-native-background-fetch`.
  - JSON format with all tables.
  - User picks target folder once during setup.
  - Keeps last 4 backups, rotates older ones.

#### F-20: OEM Battery Guide

- **Description:** In-app guide for Xiaomi/Samsung/OPPO/OnePlus battery whitelist setup.
- **Acceptance Criteria:**
  - Detects device manufacturer via `react-native-device-info`.
  - Shows step-by-step screenshots for that OEM.
  - Direct intent-launch to relevant settings page where supported.

---

## 7. Constraints

### 7.1 Technical Constraints

- Must work fully offline except for email send and one-time model download.
- Total install footprint ≤150 MB including model (smaller than Kotlin version due to JS bundle, but no native code generation overhead).
- Min Android version: API 28 (Android 9).
- No third-party analytics, ads, or telemetry SDKs.
- No local development machine available — all builds run in GitHub Actions.

### 7.2 Build Pipeline Constraints

- All builds must succeed in GitHub Actions Linux runners (ubuntu-latest).
- Build artifacts must be downloadable from any device with a browser (including the user's phone).
- The user cannot run `npm install`, `npx`, `eas`, `adb`, or any other CLI locally.
- All debugging information must come from CI logs and the in-app Diagnostics screen.

### 7.3 Business Constraints

- Personal project — no commercial considerations.
- No app store distribution required (sideload via APK).
- No external user support or update infrastructure.

### 7.4 Regulatory Constraints

- Notification Listener access requires explicit user grant.
- Calendar write requires runtime permission.
- All data stays on device — no GDPR/data-residency concerns.

---

## 8. Assumptions

- User runs Android 9 or higher on a device with ≥4 GB RAM.
- User can manage GitHub repository access from their phone or work computer.
- User can manage SMTP credentials for email reports.
- User accepts the trade-off of one-time model download vs. pure offline.
- Notification text from messaging apps contains sufficient content (not just "1 new message").
- GitHub Actions free tier provides sufficient minutes (2000/month for public repos, more if repo is public).

---

## 9. Dependencies

### 9.1 React Native Stack

- React Native 0.85+ (New Architecture default)
- Expo SDK 55+ with Development Build (bare-ish workflow for custom native modules)
- Hermes V1 JavaScript engine
- TypeScript 5+

### 9.2 Critical Libraries

- `react-native` 0.85+
- `expo` 55+
- `expo-notifications` for outgoing notifications
- `@notifee/react-native` for advanced persistent and scheduled notifications
- `expo-sqlite` or `react-native-quick-sqlite` for local DB
- `drizzle-orm` for type-safe DB access
- `zustand` for state management
- `expo-calendar` for calendar integration
- `expo-file-system` + `expo-sharing` for export/import
- `expo-background-fetch` for daily email scheduler
- `react-native-device-info` for OEM detection
- `react-native-mmkv` for fast key-value storage (encrypted)
- `onnxruntime-react-native` for ML inference (Phase 4)
- `react-native-smtp-mailer` (or similar) for email send
- React Navigation 7+ for routing

### 9.3 Custom Native Module

- A custom Kotlin native module wrapping `NotificationListenerService`, since no maintained RN library supports the New Architecture for this use case. Details in SRS Section 3.4.

### 9.4 Build Tooling

- GitHub Actions
- EAS CLI (used in local mode within Actions runners)
- Gradle 8+
- JDK 17

---

## 10. Risks & Mitigations

| Risk                                                    | Impact       | Likelihood  | Mitigation                                                                                                        |
| ------------------------------------------------------- | ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| **No maintained RN notification listener for New Arch** | **Critical** | **Certain** | Build a custom Kotlin native module with TurboModule spec. Allocate Phase 1 effort for this. See SRS Section 3.4. |
| OEM kills foreground service aggressively               | High         | High        | Provide F-20 setup guide; user manually whitelists                                                                |
| Headless JS task gets killed in background              | High         | Medium      | Use foreground service to keep process alive; combine with WorkManager for resilience                             |
| Model size too large for download                       | Medium       | Medium      | Start with rule-only; make model optional                                                                         |
| WhatsApp notification format changes                    | High         | Low         | Defensive parsing; fall back to whole-text capture                                                                |
| False positive rate too high initially                  | Medium       | Medium      | Confirmation flow + learning system reduces over time                                                             |
| User loses device — data unrecoverable                  | High         | Low         | F-19 automated backup to chosen folder                                                                            |
| Hindi NLP accuracy lower than English                   | Medium       | Medium      | Extensive seed vocabulary in Hindi/Hinglish; learning system closes gap                                           |
| **CI build fails on user's phone install**              | **High**     | **Medium**  | **Test on real device every release; include device-info debugging in onboarding**                                |
| **JS bridge adds latency to notification processing**   | Medium       | Medium      | Filter aggressively in native layer; only send useful notifications to JS                                         |
| GitHub Actions runner spec insufficient for builds      | Low          | Low         | Use large runners ($) only if needed; build time budget is generous                                               |
| React Native version churn breaks dependencies          | Medium       | Medium      | Pin all versions; quarterly upgrade window only                                                                   |

---

## 11. Release Plan

### 11.1 Release Phases

**Release 0.1 (Pipeline) — Phase 0 Complete**

- Repo scaffolded, Expo project initialized.
- GitHub Actions workflow producing debug APK on every push.
- User can download and install APK; sees a "Hello TaskMind" screen.
- Target: 1 week.

**Release 1.0 (MVP) — Phases 1+2 Complete**

- Notification capture (custom native module), rule-based extraction, task CRUD, persistent notification, priority system, VIP contacts, confirmation flow, nudges, history view.
- Target: 5 weeks of development.

**Release 1.1 — Phase 3 Complete**

- Calendar push, transcript import, export/import, email reports.
- Target: +2 weeks.

**Release 1.2 — Phase 4 Complete**

- On-device ML model, sender reputation, learned vocabulary.
- Target: +3 weeks.

**Release 1.3 — Phase 5 Complete**

- Debug log, automated backup, OEM guide, polish.
- Target: +1 week.

---

## 12. Open Questions

1. Should the model download URL be hardcoded or user-configurable?
2. Should email reports support attachments (e.g., CSV of today's tasks)?
3. Should the user host the release keystore in GitHub secrets or generate it once at first install?
4. Should debug APKs and release APKs differ in features (e.g., debug-only diagnostics screen always available, or behind a toggle in release)?
5. Should the persistent notification show a one-tap "snooze app for 30 min" — no, this would defeat the anti-procrastination design. Confirmed: not included.
6. Confirm: GitHub repository should be public (more Actions minutes, easier APK access) or private (cost of paying for minutes if quota exhausted)? Recommendation: public.
