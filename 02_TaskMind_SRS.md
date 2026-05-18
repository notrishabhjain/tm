# Software Requirements Specification (SRS)

## TaskMind — Personal Task Automation App for Android

| Field                  | Value                                   |
| ---------------------- | --------------------------------------- |
| **Document Version**   | 2.0                                     |
| **Date**               | May 18, 2026                            |
| **Author**             | RJ                                      |
| **IEEE 830 Compliant** | Yes                                     |
| **Target Audience**    | Kiro Agent (Development)                |
| **Stack**              | React Native + Expo (Development Build) |
| **Build Environment**  | GitHub Actions only                     |

---

## 1. Introduction

### 1.1 Purpose

This document specifies the software requirements for TaskMind, a native Android task automation application built with React Native. It is intended to guide the Kiro development agent in implementing the system. It complements the PRD by providing technical depth: architecture, data models, interfaces, algorithms, native module design, and CI pipeline specifications.

### 1.2 Scope

The system shall:

- Capture and parse incoming notifications system-wide.
- Convert detected actionable content into structured tasks.
- Manage task lifecycle with no defer/snooze affordance.
- Operate fully offline post-setup.
- Learn and adapt from user behavior on-device.
- Build entirely through GitHub Actions without requiring a local development environment.

### 1.3 Definitions, Acronyms, Abbreviations

| Term        | Meaning                                           |
| ----------- | ------------------------------------------------- |
| RN          | React Native                                      |
| JSI         | JavaScript Interface (RN New Architecture core)   |
| TurboModule | Native module spec under the New Architecture     |
| Fabric      | New Architecture renderer                         |
| Headless JS | RN mechanism for running JS code without UI       |
| NLS         | NotificationListenerService — Android API         |
| EAS         | Expo Application Services                         |
| MMKV        | Mobile Key-Value storage (replaces AsyncStorage)  |
| ONNX        | Open Neural Network Exchange format for ML models |
| Hinglish    | Hindi written in Latin script                     |

### 1.4 References

- PRD Document v2.0
- UI/UX Design Specification v2.0
- CI/CD Pipeline Specification v1.0
- React Native 0.85 documentation (reactnative.dev/docs)
- Expo SDK 55 documentation
- Android NotificationListenerService API documentation
- IEEE Std 830-1998

---

## 2. Overall Description

### 2.1 Product Perspective

TaskMind is a standalone Android application built with React Native using the New Architecture (JSI + Fabric + TurboModules). It depends on no backend service. It interacts with:

- The Android OS via a custom native module (notifications, foreground service).
- The Android calendar provider via `expo-calendar`.
- The user's configured SMTP server for outbound email only.
- A model download endpoint for one-time setup only.

### 2.2 Product Functions Summary

- F-NL-01: Notification capture (custom native module)
- F-EX-01: Text-to-task extraction (TypeScript)
- F-TM-01: Task management
- F-PR-01: Priority assignment
- F-NT-01: Persistent and nudge notifications
- F-CF-01: Confirmation flow
- F-CL-01: Calendar event creation
- F-TR-01: Transcript-to-task conversion
- F-IO-01: Import/export
- F-EM-01: Daily email reporting
- F-LR-01: On-device learning and adaptation
- F-CI-01: CI/CD pipeline (covered in dedicated CI document)

### 2.3 User Characteristics

Single primary user with:

- MERN stack development background.
- Bilingual (English/Hindi) communication style.
- No local Android development environment.
- Comfort with Android power-user settings.
- Familiarity with task management concepts.
- Tests builds by downloading APKs from GitHub Actions to phone.

### 2.4 General Constraints

- **C-1:** All processing on-device after model download.
- **C-2:** Min SDK = 28, Target SDK = 34+.
- **C-3:** App must survive device reboot and OEM battery optimization.
- **C-4:** Total APK + model footprint ≤150 MB.
- **C-5:** Notification processing latency <3000 ms end-to-end (includes JS bridge overhead).
- **C-6:** All builds must succeed in GitHub Actions Linux runners.
- **C-7:** No local development required — debugging via in-app diagnostics screen and CI logs only.

### 2.5 Assumptions and Dependencies

- Android NLS API remains stable across target versions.
- WhatsApp notification format includes sender in `title` field.
- User has device storage ≥500 MB free.
- React Native New Architecture remains stable (already default since 0.76, locked in 0.82+).

---

## 3. System Architecture

### 3.1 Architectural Style

**Layered Architecture** for a React Native app, with strict separation between native, JS service, and presentation layers:

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION (React Components, Expo Router screens)       │
│  - Screens, hooks, UI state (Zustand)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  DOMAIN (Pure TypeScript)                                   │
│  - Task entities, use cases, validation rules               │
│  - Extraction pipeline, priority assignment, learning algo  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  DATA (Repositories, Drizzle ORM, MMKV)                     │
│  - DB access, settings, encrypted storage                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  PLATFORM SERVICES                                          │
│  - Native modules (custom + Expo SDK)                       │
│  - Headless JS notification handler                         │
│  - Background scheduler (notifee/expo-background-fetch)     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Project Structure

```
taskmind/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Lint + tests on every push
│       ├── build-debug.yml        # Build debug APK
│       └── build-release.yml      # Build & sign release APK
├── android/                       # Native Android code (managed by Expo prebuild + custom modules)
│   └── app/
│       └── src/main/java/com/taskmind/
│           ├── notifications/      # Custom NotificationListenerService
│           └── foregroundservice/  # Persistent notification service
├── modules/
│   └── notification-listener/      # Custom local Expo module (TurboModule spec)
│       ├── android/
│       ├── src/
│       └── expo-module.config.json
├── src/
│   ├── app/                       # Expo Router screens
│   │   ├── (tabs)/
│   │   │   ├── index.tsx          # Home / Tasks
│   │   │   ├── confirmations.tsx
│   │   │   ├── history.tsx
│   │   │   └── settings.tsx
│   │   ├── task/[id].tsx          # Task detail
│   │   ├── transcript.tsx         # Transcript import
│   │   ├── settings/              # Settings sub-screens
│   │   └── onboarding/            # Onboarding flow
│   ├── domain/                    # Pure TS, no RN imports
│   │   ├── entities/              # Task, Priority, etc.
│   │   ├── usecases/              # CreateTask, CompleteTask, etc.
│   │   ├── extraction/            # Pipeline stages
│   │   ├── learning/              # Vocabulary & reputation logic
│   │   └── validators/
│   ├── data/                      # Data layer
│   │   ├── db/
│   │   │   ├── schema.ts          # Drizzle schema
│   │   │   ├── migrations/
│   │   │   └── client.ts
│   │   ├── repositories/
│   │   └── storage/               # MMKV wrappers
│   ├── services/                  # Side-effectful service wrappers
│   │   ├── notification-handler.ts # Headless JS task
│   │   ├── persistent-notification.ts
│   │   ├── nudge-scheduler.ts
│   │   ├── email-sender.ts
│   │   ├── ml-inference.ts        # ONNX wrapper
│   │   ├── calendar.ts
│   │   ├── backup.ts
│   │   └── transcript-import.ts
│   ├── ui/                        # Reusable components
│   │   ├── components/
│   │   ├── theme/                 # Design tokens
│   │   └── icons/
│   ├── state/                     # Zustand stores
│   │   ├── tasks-store.ts
│   │   ├── settings-store.ts
│   │   └── ui-store.ts
│   ├── hooks/
│   ├── utils/
│   └── locales/
│       ├── en.json
│       └── hi.json
├── assets/
│   ├── seed-keywords.json
│   ├── models/                    # Downloaded at runtime, gitignored
│   └── fonts/
├── __tests__/                     # Jest tests
│   ├── extraction/
│   ├── domain/
│   └── learning/
├── e2e/                           # Detox tests (post-MVP)
├── scripts/
│   ├── seed-db.ts
│   └── generate-keystore.sh
├── docs/
│   ├── adr/                       # Architecture Decision Records
│   ├── ci-pipeline.md
│   └── debugging-without-ide.md
├── app.json                       # Expo config
├── eas.json                       # EAS Build profiles
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
└── README.md
```

### 3.3 Technology Stack

| Layer                     | Technology                                               | Version      |
| ------------------------- | -------------------------------------------------------- | ------------ |
| Framework                 | React Native                                             | 0.85+        |
| Meta-framework            | Expo with Development Build                              | SDK 55+      |
| JS Engine                 | Hermes V1                                                | (RN default) |
| Architecture              | New Architecture (Fabric + JSI + TurboModules)           | Required     |
| Language                  | TypeScript (strict mode)                                 | 5.3+         |
| Routing                   | Expo Router                                              | 4+           |
| State (UI)                | Zustand                                                  | 4+           |
| State (Server-state-like) | TanStack Query (for DB reactivity)                       | 5+           |
| Database                  | expo-sqlite (or react-native-quick-sqlite)               | latest       |
| ORM                       | Drizzle ORM                                              | latest       |
| KV Storage                | react-native-mmkv                                        | latest       |
| Encryption                | react-native-mmkv encryption + Android Keystore          | latest       |
| Notifications (out)       | @notifee/react-native                                    | latest       |
| Notifications (in)        | Custom Local Expo Module (TurboModule)                   | n/a          |
| Calendar                  | expo-calendar                                            | latest       |
| File system               | expo-file-system + expo-sharing                          | latest       |
| Background work           | expo-background-fetch + Notifee triggers                 | latest       |
| Device info               | react-native-device-info                                 | latest       |
| Email                     | react-native-smtp-mailer (or @emailjs/native equivalent) | latest       |
| ML Inference              | onnxruntime-react-native                                 | latest       |
| Forms                     | react-hook-form                                          | latest       |
| Animations                | react-native-reanimated 3+                               | latest       |
| Gestures                  | react-native-gesture-handler                             | latest       |
| Lists                     | @shopify/flash-list                                      | latest       |
| Testing                   | Jest + React Native Testing Library                      | latest       |
| E2E Testing               | Detox (post-MVP)                                         | latest       |
| Linting                   | ESLint + @typescript-eslint + eslint-plugin-react-native | latest       |
| Formatting                | Prettier                                                 | latest       |
| Build                     | Gradle 8+ via Expo prebuild                              | latest       |
| CI                        | GitHub Actions                                           | n/a          |
| Build orchestration       | EAS CLI (local mode in CI)                               | latest       |

### 3.4 Custom Notification Listener Native Module

This is the highest-risk component. No maintained React Native package supports the New Architecture for `NotificationListenerService` access.

#### 3.4.1 Rationale

- `react-native-android-notification-listener` last updated 2+ years ago, pre-New Architecture.
- Existing alternatives are abandoned or incomplete.
- The functionality is too central to risk a forked, unmaintained dependency.

#### 3.4.2 Implementation Plan

Build as a **local Expo Module** under `modules/notification-listener/` using the Expo Modules API, which generates a TurboModule-compatible interface.

#### 3.4.3 Module Spec (TypeScript Interface)

```typescript
// modules/notification-listener/src/index.ts
export interface NotificationData {
  packageName: string;
  appName: string;
  title: string;
  text: string;
  bigText: string;
  subText: string;
  postTime: number;
  isGroup: boolean;
}

export interface NotificationListenerModule {
  // Permission management
  getPermissionStatus(): Promise<'granted' | 'denied' | 'unknown'>;
  requestPermission(): Promise<void>;

  // Service lifecycle
  startService(): Promise<void>;
  stopService(): Promise<void>;
  isServiceRunning(): Promise<boolean>;

  // Foreground notification management
  updatePersistentNotification(params: {
    pendingCount: number;
    urgentCount: number;
    topTaskText: string;
    secondTaskText: string | null;
  }): Promise<void>;
  hidePersistentNotification(): Promise<void>;

  // Events
  addListener(
    eventName: 'onNotification' | 'onQuickAction',
    listener: (data: any) => void
  ): EventSubscription;
}
```

#### 3.4.4 Android Implementation Components

1. **`TaskMindNotificationListenerService.kt`** — extends `NotificationListenerService`. Filters notifications against monitored-apps allowlist in native code (performance), then emits to JS via headless JS task.

2. **`TaskMindForegroundService.kt`** — implements `Service` with `startForeground()`. Hosts the persistent non-dismissible notification using `Notification.Builder` with `FLAG_NO_CLEAR | FLAG_ONGOING_EVENT`. Provides PendingIntent quick actions.

3. **`NotificationModule.kt`** — Expo Module wrapper exposing TypeScript-friendly methods.

4. **`BootReceiver.kt`** — `BOOT_COMPLETED` BroadcastReceiver that restarts the foreground service.

5. **`QuickActionReceiver.kt`** — handles "Mark Top Done" and "Open" actions from persistent notification, dispatches to JS layer.

#### 3.4.5 Headless JS Bridge

When a notification arrives:

1. Native service captures notification.
2. Filters against monitored apps in native code.
3. If allowed, registers a Headless JS task with serialized notification data.
4. JS handler in `src/services/notification-handler.ts` runs (process kept alive by foreground service).
5. JS handler invokes the extraction pipeline (pure TS).
6. Result written to DB via repository layer.
7. Native module notified to update persistent notification.

#### 3.4.6 Why Not Use Foreground Service Permission Only

Headless JS alone is unreliable on aggressive OEMs. The foreground service we already need for the persistent notification doubles as a process-keep-alive mechanism for the notification listener. This is the standard pattern for production notification-monitoring apps.

### 3.5 React Native New Architecture Compliance

- All chosen libraries must support the New Architecture (verified via `npx expo-doctor`).
- Hermes V1 must be enabled.
- No legacy bridge calls; all native modules use TurboModule spec.
- Fabric renderer is used for all components.

---

## 4. Functional Requirements

### 4.1 Notification Capture Subsystem

**FR-NL-01:** The system shall implement a custom Expo Module wrapping Android's `NotificationListenerService` that intercepts every `StatusBarNotification`.

**FR-NL-02:** The system shall extract these fields:

- `packageName: string`
- `appName: string` (resolved via PackageManager)
- `title: string` (from `EXTRA_TITLE`)
- `text: string` (from `EXTRA_TEXT`)
- `bigText: string` (from `EXTRA_BIG_TEXT`)
- `subText: string`
- `postTime: number` (epoch ms)
- `isGroup: boolean` (best-effort heuristic)

**FR-NL-03:** The native layer shall filter notifications against the user's `monitored_apps` allowlist before bridging to JS, for performance.

**FR-NL-04:** The system shall deduplicate notifications with identical `(packageName, title, text)` arriving within 5 seconds.

**FR-NL-05:** A foreground service shall keep the JavaScript runtime alive for headless notification handling.

**FR-NL-06:** The foreground service shall auto-restart on device boot via `BOOT_COMPLETED` receiver.

**FR-NL-07:** End-to-end latency from notification post to task DB write shall be <3000ms (p95). The JS bridge adds overhead vs a pure-native solution; this is accepted.

### 4.2 Task Extraction Pipeline

**FR-EX-01:** The pipeline shall be implemented as composable, pure TypeScript stages:

```
Stage 1: LanguageDetector → DetectedLanguage
Stage 2: Preprocessor → NormalizedText
Stage 3: RuleEngine → RuleResult (matched keywords, score)
Stage 4: ModelInferer → ModelResult (label, confidence)  // optional, async
Stage 5: PriorityAssigner → AssignedPriority
Stage 6: ActionExtractor → ExtractedAction (task text)
Stage 7: ConfidenceAggregator → FinalDecision
```

**FR-EX-02:** Each stage shall be a pure function, exhaustively unit-testable with no RN or native dependencies.

**FR-EX-03:** **Language Detection** — classify input as `en`, `hi` (Devanagari), or `hi-en` (Hinglish). Use Unicode-range heuristics for v1.

**FR-EX-04:** **Preprocessing** — lowercase Latin chars, NFC-normalize Unicode, optionally strip emoji, collapse whitespace. Preserve original as `rawSourceText`.

**FR-EX-05:** **Rule Engine** — match preprocessed text against seed + learned vocabularies. Case-insensitive, word-boundary aware for Latin, substring for Devanagari.

**FR-EX-06:** **Rule Engine Confidence:**

```
score = 0.0
+ 0.40 if IMPERATIVE matched
+ 0.20 if URGENCY matched
+ 0.15 if DEADLINE matched
+ 0.15 if 2nd-person pronoun present
+ 0.10 if word_count in [5, 40]
- 0.30 if ANTI_PATTERN matched AND no IMPERATIVE
- 0.20 if word_count < 3
score = clamp(score, 0.0, 1.0)
```

**FR-EX-07:** **Model Inference** — when ONNX model loaded, tokenize and run inference with 500ms timeout via `onnxruntime-react-native`. Fall back to rule-only if unavailable.

**FR-EX-08:** **Combined Score:**

```
final_confidence = (rule_score * w_rule) + (model_confidence * w_model)
```

Weights default 0.5/0.5, configurable in advanced settings.

**FR-EX-09:** **Decision Thresholds:**

- `final ≥ 0.75` → auto-create (`needsConfirmation = false`)
- `0.40 ≤ final < 0.75` → create with `needsConfirmation = true`
- `final < 0.40` → discard, log to `discarded_log`
- VIP sender override: any confidence ≥ 0.30 → auto-create URGENT

**FR-EX-10:** **Action Extraction** — extract concise task text from source, not full notification. Find first IMPERATIVE keyword, take to next sentence terminator.

### 4.3 Task Management Subsystem

**FR-TM-01:** Tasks persisted in Drizzle-managed SQLite with the entity defined in Section 5.1.

**FR-TM-02:** TaskRepository shall expose:

- `createTask(input: CreateTaskInput): Promise<Task>`
- `updateTask(id: string, patch: Partial<Task>): Promise<Task>`
- `completeTask(id: string): Promise<void>`
- `deleteTask(id: string): Promise<void>` — soft delete
- `getPendingTasks(): Promise<Task[]>` (also exposed as reactive query via TanStack Query)
- `getTaskById(id: string): Promise<Task | null>`
- `getHistory(filters: HistoryFilters): Promise<Task[]>`

**FR-TM-03:** No operation that defers, snoozes, or hides pending tasks shall exist anywhere in the codebase.

**FR-TM-04:** Soft-deleted tasks retained for 30 days, then hard-deleted via daily background job.

### 4.4 Priority Subsystem

**FR-PR-01:** Priority enum: `URGENT | HIGH | MEDIUM | LOW`.

**FR-PR-02:** Priority assignment rules (first match wins):

1. Sender in `vip_contacts` → `URGENT`
2. URGENCY keyword with `critical` flag → `URGENT`
3. URGENCY + DEADLINE → `HIGH`
4. URGENCY alone → `HIGH`
5. IMPERATIVE alone → `MEDIUM`
6. Otherwise → `LOW`

**FR-PR-03:** User can override any task's priority manually.

### 4.5 Notification & Nudge Subsystem

**FR-NT-01:** Exactly one persistent notification shall exist while ≥1 pending task exists. Implemented via the custom native module's foreground service, NOT via Notifee, because Notifee cannot create truly non-dismissible notifications.

Notification properties:

- Channel: `persistent_status`, importance LOW (silent)
- Flags: `FLAG_ONGOING_EVENT | FLAG_NO_CLEAR`
- Title: "TaskMind"
- Text: "{N} pending • {M} urgent"
- Expanded: BigTextStyle with top 2 task texts
- Actions: "Open" and "Done Top"

**FR-NT-02:** Nudge notifications scheduled via Notifee triggers:

- Frequency from settings
- Suppressed during quiet hours unless URGENT override active
- Per-priority frequency override supported
- Channel: `nudge_default`, importance HIGH
- Dismissible (single-shot reminders)

**FR-NT-03:** Required notification channels:
| Channel ID | Name | Importance | Sound | Vibration |
|---|---|---|---|---|
| `persistent_status` | Pending Tasks Status | LOW | None | None |
| `nudge_default` | Nudges | HIGH | Default | Yes |
| `confirmation` | Task Confirmations | HIGH | Default | Yes |

### 4.6 Confirmation Flow

**FR-CF-01:** Tasks with `needsConfirmation=true` trigger a heads-up notification:

- Title: "Possible task from {sender}"
- Text: extracted task text
- Actions: "Yes, Add" / "No, Discard" / "Open"

**FR-CF-02:** "Yes, Add" sets `needsConfirmation=false`, increments positive sender_stats signal, updates persistent notification.

**FR-CF-03:** "No, Discard" deletes the task, increments negative signal, adds phrase to negative learning queue.

**FR-CF-04:** Confirmation Inbox screen lists all pending confirmations.

### 4.7 Calendar Integration

**FR-CL-01:** "Add to Calendar" action available on every task in detail view.

**FR-CL-02:** Implementation via `expo-calendar`:

- Request `WRITE_CALENDAR` permission at point of use
- Use `Calendar.createEventAsync()` to insert
- Pre-fill: title = task.text, notes = source context
- Default duration: configurable (15/30/60 min), default 30
- Default time: task.dueAt ?? now + 1h

**FR-CL-03:** Captured event ID stored in `Task.calendarEventId`.

### 4.8 Transcript Import

**FR-TR-01:** Transcript screen accepts text input up to 50,000 characters.

**FR-TR-02:** On submit:

- Segment by sentence boundaries (`.`, `!`, `?`, `।`, `\n`)
- Filter segments < 10 chars
- Run extraction pipeline with threshold 0.55 (higher than notifications)
- Present checkable list with editable text and priority

**FR-TR-03:** Batch insert on user confirmation with `sourceApp = "Meeting Transcript"`.

### 4.9 Import / Export

**FR-IO-01:** Export produces CSV or JSON via `expo-file-system`, shared via `expo-sharing`.

**FR-IO-02:** Filename: `taskmind_export_{scope}_{yyyyMMdd_HHmmss}.{ext}`

**FR-IO-03:** JSON schema matches Task TypeScript interface with ISO-8601 timestamps.

**FR-IO-04:** CSV columns: `id, text, raw_source_text, priority, status, source_app, sender, created_at, completed_at, due_at, language`.

**FR-IO-05:** Import validates schema, shows preview, offers merge-by-id or replace-all.

### 4.10 Email Reporting

**FR-EM-01:** SMTP credentials stored in encrypted MMKV instance (using Android Keystore):

- `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password`, `recipient_email`, `use_tls`

**FR-EM-02:** Daily WorkManager-backed job at user-configured time sends report. Retries 3x with exponential backoff on failure.

**FR-EM-03:** Email report (HTML + plain text fallback):

- Subject: `TaskMind Daily Report — {yyyy-MM-dd}`
- Summary: Created today, Completed today, Deleted today, Pending by priority
- Completed today: list with priority, text, source, completion time
- Pending: grouped by priority, oldest first
- Top sources: top 5
- Insights: avg time-to-complete by priority

### 4.11 Learning Subsystem

**FR-LR-01:** Per-sender stats tracked in `sender_stats`:

- Increment `tasks_created` on every task created
- Increment `tasks_confirmed` on user confirm or completion
- Increment `tasks_deleted` on delete within 5 min of creation
- Increment `tasks_completed` on completion

**FR-LR-02:** Sender reputation adjustment:

```
confirm_rate = tasks_confirmed / max(tasks_created, 1)
if tasks_created >= 5:
  if confirm_rate > 0.8: confidence += 0.10
  elif confirm_rate < 0.3: confidence -= 0.15
```

**FR-LR-03:** N-gram extraction from confirmed tasks:

- 1-grams, 2-grams, 3-grams from `rawSourceText`
- Filter stopwords and seed keywords
- Insert/increment in `learned_keywords` with status `PENDING`

**FR-LR-04:** Promotion: `frequency >= 3` AND no demotion → `ACTIVE`, weight 0.5x of seed.

**FR-LR-05:** Demotion: more deletes than confirms → `DEMOTED`, removed from active matching.

**FR-LR-06:** Learned Vocabulary screen lists active phrases with manual remove option.

---

## 5. Data Requirements

### 5.1 Database Schema (Drizzle ORM + SQLite)

#### Table: `tasks`

```typescript
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(), // UUID
  text: text('text').notNull(),
  rawSourceText: text('raw_source_text').notNull(),
  priority: text('priority').notNull(), // URGENT | HIGH | MEDIUM | LOW
  status: text('status').notNull(), // PENDING | COMPLETED | DELETED
  sourceApp: text('source_app').notNull(),
  sourceAppDisplay: text('source_app_display').notNull(),
  sender: text('sender'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
  deletedAt: integer('deleted_at'),
  dueAt: integer('due_at'),
  triggerKeywords: text('trigger_keywords').notNull(), // JSON
  confidence: real('confidence').notNull(),
  ruleScore: real('rule_score').notNull(),
  modelScore: real('model_score'),
  needsConfirmation: integer('needs_confirmation', { mode: 'boolean' }).notNull(),
  calendarEventId: text('calendar_event_id'),
  language: text('language').notNull(),
});

// Indexes
export const tasksCreatedAtIdx = index('idx_tasks_created_at').on(tasks.createdAt);
export const tasksStatusIdx = index('idx_tasks_status').on(tasks.status);
export const tasksPriorityIdx = index('idx_tasks_priority').on(tasks.priority);
```

#### Table: `vip_contacts`

```typescript
export const vipContacts = sqliteTable('vip_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});
```

#### Table: `monitored_apps`

```typescript
export const monitoredApps = sqliteTable('monitored_apps', {
  packageName: text('package_name').primaryKey(),
  displayName: text('display_name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  addedAt: integer('added_at').notNull(),
});
```

#### Table: `seed_keywords`

```typescript
export const seedKeywords = sqliteTable('seed_keywords', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phrase: text('phrase').notNull(),
  category: text('category').notNull(), // IMPERATIVE | URGENCY | DEADLINE | REQUEST | ANTI_PATTERN | DOMAIN
  language: text('language').notNull(),
  weight: real('weight').notNull().default(1.0),
});
```

#### Table: `learned_keywords`

```typescript
export const learnedKeywords = sqliteTable(
  'learned_keywords',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    phrase: text('phrase').notNull(),
    category: text('category').notNull(),
    language: text('language').notNull(),
    frequency: integer('frequency').notNull().default(0),
    weight: real('weight').notNull().default(0.5),
    confirmCount: integer('confirm_count').notNull().default(0),
    deleteCount: integer('delete_count').notNull().default(0),
    status: text('status').notNull(), // PENDING | ACTIVE | DEMOTED
    firstSeen: integer('first_seen').notNull(),
    lastUsed: integer('last_used').notNull(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex('idx_phrase_lang').on(table.phrase, table.language),
  })
);
```

#### Table: `sender_stats`

```typescript
export const senderStats = sqliteTable(
  'sender_stats',
  {
    senderName: text('sender_name').notNull(),
    sourceApp: text('source_app').notNull(),
    tasksCreated: integer('tasks_created').notNull().default(0),
    tasksConfirmed: integer('tasks_confirmed').notNull().default(0),
    tasksDeleted: integer('tasks_deleted').notNull().default(0),
    tasksCompleted: integer('tasks_completed').notNull().default(0),
    firstSeen: integer('first_seen').notNull(),
    lastSeen: integer('last_seen').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.senderName, table.sourceApp] }),
  })
);
```

#### Table: `training_log`

```typescript
export const trainingLog = sqliteTable('training_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  label: text('label').notNull(), // TASK | NOT_TASK
  source: text('source').notNull(), // user_confirm | user_delete | user_complete
  timestamp: integer('timestamp').notNull(),
});
```

#### Table: `discarded_log`

```typescript
export const discardedLog = sqliteTable('discarded_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  sourceApp: text('source_app').notNull(),
  sender: text('sender'),
  confidence: real('confidence').notNull(),
  reason: text('reason').notNull(), // LOW_CONFIDENCE | ANTI_PATTERN | TOO_SHORT
  timestamp: integer('timestamp').notNull(),
});
// Capped at 500 rows via scheduled cleanup
```

### 5.2 Settings Storage (MMKV)

Two MMKV instances:

**`settings` (unencrypted):**
| Key | Type | Default |
|---|---|---|
| `nudge_frequency_minutes` | number | 60 |
| `quiet_hours_start` | string (HH:mm) | "22:00" |
| `quiet_hours_end` | string (HH:mm) | "07:00" |
| `urgent_override_quiet` | boolean | true |
| `nudge_freq_urgent` | number | 15 |
| `nudge_freq_high` | number | 60 |
| `nudge_freq_medium` | number | 120 |
| `nudge_freq_low` | number | 240 |
| `email_enabled` | boolean | false |
| `email_send_time` | string | "21:00" |
| `model_downloaded` | boolean | false |
| `model_version` | string | "" |
| `rule_weight` | number | 0.5 |
| `model_weight` | number | 0.5 |
| `auto_backup_enabled` | boolean | true |
| `auto_backup_folder` | string | "" |
| `theme` | "system"\|"light"\|"dark" | "system" |
| `language` | string | "en" |

**`secrets` (encrypted via Android Keystore):**

- `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_recipient`, `smtp_use_tls`

---

## 6. External Interface Requirements

### 6.1 User Interfaces

Specified in separate UI/UX Design Specification document.

### 6.2 Hardware Interfaces

- Microphone: NOT used.
- Camera: NOT used.
- Storage: read/write to Scoped Storage via expo-file-system.

### 6.3 Software Interfaces

#### 6.3.1 Android System APIs (via native module)

- `NotificationListenerService`
- `NotificationManager` + `NotificationChannel`
- `Service` (foreground)
- `AlarmManager` (indirectly via Notifee)
- `CalendarContract` (via expo-calendar)
- `BroadcastReceiver` (BOOT_COMPLETED)

#### 6.3.2 SMTP Server Interface

- SMTP over TLS (port 587 or 465)
- PLAIN/LOGIN authentication
- Outbound only

#### 6.3.3 Model Download Interface

- HTTPS GET to user-configured URL OR hardcoded GitHub Releases asset
- One-time during onboarding
- SHA-256 verification

### 6.4 Communications Interfaces

- HTTPS for model download and SMTP send only
- No other outbound network calls
- No inbound network listeners

---

## 7. Non-Functional Requirements

### 7.1 Performance Requirements

| ID        | Requirement                               | Target                         |
| --------- | ----------------------------------------- | ------------------------------ |
| NFR-PF-01 | End-to-end notification → task creation   | <3000 ms (p95)                 |
| NFR-PF-02 | ML inference latency                      | <500 ms (p95)                  |
| NFR-PF-03 | App cold start (JS bundle)                | <2500 ms                       |
| NFR-PF-04 | Task list scroll (FlashList, 1000+ tasks) | 60 fps                         |
| NFR-PF-05 | Battery drain                             | <4% per day with typical usage |
| NFR-PF-06 | RAM footprint                             | <200 MB resident               |
| NFR-PF-07 | JS bundle size (Hermes bytecode)          | <8 MB                          |

### 7.2 Reliability Requirements

| ID        | Requirement                                            |
| --------- | ------------------------------------------------------ |
| NFR-RL-01 | App crash rate <1 per 1000 sessions                    |
| NFR-RL-02 | Foreground service auto-restart within 30s of OEM kill |
| NFR-RL-03 | DB writes via transactions; no partial writes          |
| NFR-RL-04 | Failed email sends retry 3x with exponential backoff   |
| NFR-RL-05 | Notification dedup prevents ≥99% of duplicates         |
| NFR-RL-06 | CI build success rate ≥95% on main branch              |

### 7.3 Security Requirements

| ID        | Requirement                                                     |
| --------- | --------------------------------------------------------------- |
| NFR-SC-01 | SMTP credentials only in encrypted MMKV                         |
| NFR-SC-02 | Database protected by Android app sandbox                       |
| NFR-SC-03 | No third-party SDK with network I/O without user consent        |
| NFR-SC-04 | Exported files exclude SMTP credentials                         |
| NFR-SC-05 | Permissions requested at point of use with rationale dialogs    |
| NFR-SC-06 | Release keystore stored only in GitHub secrets, never committed |
| NFR-SC-07 | Hermes bytecode + ProGuard for release builds                   |

### 7.4 Maintainability Requirements

| ID        | Requirement                                                        |
| --------- | ------------------------------------------------------------------ |
| NFR-MN-01 | Code coverage ≥70% on `src/domain/` and `src/services/extraction/` |
| NFR-MN-02 | All public APIs in domain layer have TSDoc                         |
| NFR-MN-03 | Cyclomatic complexity per function ≤15                             |
| NFR-MN-04 | No function >60 lines (excluding tests)                            |
| NFR-MN-05 | ESLint + Prettier + TypeScript strict mode enforced in CI          |
| NFR-MN-06 | TypeScript strict mode enabled (`strict: true` in tsconfig)        |

### 7.5 Portability Requirements

| ID        | Requirement                                                        |
| --------- | ------------------------------------------------------------------ |
| NFR-PT-01 | Support Android 9 (API 28) through latest stable                   |
| NFR-PT-02 | Tested on at least one Xiaomi/Redmi, one Samsung, one Pixel device |
| NFR-PT-03 | UI adapts to screen sizes 5"–7" without breakage                   |
| NFR-PT-04 | Support light and dark theme                                       |
| NFR-PT-05 | Support portrait orientation; landscape acceptable on tablets only |

### 7.6 Usability Requirements

| ID        | Requirement                                                |
| --------- | ---------------------------------------------------------- |
| NFR-US-01 | Onboarding completable in <3 minutes                       |
| NFR-US-02 | Common task actions reachable in ≤2 taps from notification |
| NFR-US-03 | All interactive elements ≥48dp touch target                |
| NFR-US-04 | Color contrast ≥4.5:1 for body text (WCAG AA)              |
| NFR-US-05 | Support font scaling up to 200%                            |

### 7.7 Build Pipeline Requirements

| ID        | Requirement                                                         |
| --------- | ------------------------------------------------------------------- |
| NFR-CI-01 | Full CI run (lint + tests + APK build) completes in <25 min         |
| NFR-CI-02 | Debug APK available as artifact on every push to any branch         |
| NFR-CI-03 | Release APK signed and attached to GitHub Release on every `v*` tag |
| NFR-CI-04 | Cache hit rate for node_modules + Gradle ≥70% across runs           |
| NFR-CI-05 | Workflow logs include device-test instructions and APK download URL |
| NFR-CI-06 | No CI step requires manual approval (except production releases)    |

---

## 8. Validation & Verification

### 8.1 Testing Strategy

| Test Type         | Tool                         | Coverage                                                              |
| ----------------- | ---------------------------- | --------------------------------------------------------------------- |
| Unit Tests        | Jest                         | Domain use cases, extraction pipeline stages, repositories with mocks |
| Component Tests   | React Native Testing Library | Critical screens                                                      |
| Integration Tests | Jest + in-memory DB          | Database operations, settings persistence                             |
| E2E Tests         | Detox (post-MVP)             | Critical flows on emulator in CI                                      |
| Manual Tests      | Real device                  | OEM-specific behavior, real WhatsApp, email delivery                  |
| CI Smoke Test     | curl + adb in workflow       | APK installs without errors on emulator                               |

### 8.2 Test Data

- 500+ labeled notification samples across English/Hindi/Hinglish (committed as JSON corpus).
- Edge cases: emoji-only, all-caps, mixed scripts, very long, very short.
- Negative samples: greetings, status confirmations, casual chat.

### 8.3 Acceptance Test Scenarios

| TC ID    | Scenario                                             | Expected Result                                         |
| -------- | ---------------------------------------------------- | ------------------------------------------------------- |
| AT-01    | Install APK from GitHub Actions, complete onboarding | Lands on empty home screen                              |
| AT-02    | WhatsApp "kal tak report bhej dena" from VIP         | URGENT task created, persistent notif updates           |
| AT-03    | Receive "lol thanks"                                 | Discarded, logged                                       |
| AT-04    | Ambiguous "anyone has the file?"                     | Task with needsConfirmation, prompt shown               |
| AT-05    | Complete a task                                      | Moves to history with timestamp                         |
| AT-06    | Delete within 5 minutes                              | Sender stats deletion counter increments                |
| AT-07    | Paste 30-min transcript                              | Reviewable extracted list                               |
| AT-08    | Export all as CSV                                    | File created, sharable via system share sheet           |
| AT-09    | Import previously exported CSV                       | Tasks restored, duplicates skipped                      |
| AT-10    | 9 PM with active config                              | Email report received with correct data                 |
| AT-11    | Add task to calendar                                 | Calendar event created                                  |
| AT-12    | Reboot device                                        | Foreground service restarts, persistent notif reappears |
| AT-13    | Toggle airplane mode                                 | All core features work; email/model download disabled   |
| AT-14    | Confirm 50 tasks                                     | Learned vocabulary screen shows ≥5 new phrases          |
| AT-15    | Set nudge 30 min, quiet 10 PM–7 AM                   | Nudges fire correctly outside quiet hours               |
| AT-CI-01 | Push to feature branch                               | CI runs lint, tests, builds debug APK as artifact       |
| AT-CI-02 | Tag `v1.0.0`                                         | GitHub Release created with signed APK attached         |
| AT-CI-03 | Lint failure                                         | CI fails, blocks merge                                  |
| AT-CI-04 | Unit test failure                                    | CI fails, blocks merge                                  |

---

## 9. Appendices

### 9.1 Seed Keyword Reference

See PRD Section 4.2 of v1.0 spec, also attached as `assets/seed-keywords.json`.

### 9.2 State Diagrams

#### Task Lifecycle

```
[CREATED] --(needsConfirmation)--> [AWAITING_CONFIRMATION]
[CREATED] --(autoCreate)--> [PENDING]
[AWAITING_CONFIRMATION] --(user: Yes)--> [PENDING]
[AWAITING_CONFIRMATION] --(user: No)--> [DELETED]
[PENDING] --(user: Complete)--> [COMPLETED]
[PENDING] --(user: Delete)--> [DELETED]
[DELETED] --(30 days)--> [HARD_DELETED]
```

#### Process Lifecycle

```
[INSTALLED] --(first launch)--> [ONBOARDING]
[ONBOARDING] --(permissions granted)--> [SERVICE_STARTING]
[SERVICE_STARTING] --> [SERVICE_RUNNING]
[SERVICE_RUNNING] --(notification arrives)--> [PROCESSING]
[PROCESSING] --> [SERVICE_RUNNING]
[SERVICE_RUNNING] --(OEM kill)--> [STOPPED]
[STOPPED] --(BOOT_COMPLETED or scheduled job)--> [SERVICE_STARTING]
```

### 9.3 Glossary

- **Hard delete:** Permanent removal from DB.
- **Soft delete:** Status set to DELETED, row retained.
- **VIP:** Sender always producing URGENT tasks.
- **Seed keyword:** Vocabulary shipped with app.
- **Learned keyword:** Vocabulary from user behavior.
- **Headless JS:** RN feature for running JS without UI.
- **TurboModule:** New Architecture native module spec.

### 9.4 Document Conventions

- Requirement IDs: `FR-{module}-{nn}` and `NFR-{category}-{nn}`.
- "Shall" = mandatory.
- "Should" = recommended.
- "May" = optional.
