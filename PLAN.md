# TaskMind — Master Implementation Plan

| Field | Value |
|---|---|
| **Document Version** | 1.0 |
| **Date** | May 18, 2026 |
| **Status** | Awaiting approval before Phase 2 scaffolding begins |
| **Author** | Kiro Agent |
| **Approved by** | RJ (pending) |

> **Constraint reminder:** No local development environment exists. Every build, test, lint, and quality gate runs exclusively in GitHub Actions. No instruction in this document requires the user to run anything locally.

---

## 1.1 Resolved Open Questions

All open questions from PRD Section 12 and CI Pipeline Section 20 are resolved below. Questions requiring no further input are marked ✅ **Auto-resolved**. Questions that needed your decision are marked ✅ **Decided** with your confirmed answer.

| # | Question (source) | Resolution | Status |
|---|---|---|---|
| Q1 | Model download URL: hardcoded or user-configurable? (PRD Q12.1) | **Hardcoded GitHub Releases URL** for v1 (`https://github.com/notrishabhjain/tm/releases/download/model-v1/taskmind-model.onnx`). User-configurable URL added as an advanced setting in F-14 scope. SHA-256 checksum verified after download. | ✅ Decided |
| Q2 | Email reports with CSV attachment? (PRD Q12.2) | **Yes, optional CSV attachment.** Toggle in email settings: "Attach task CSV". Minimal extra effort, meaningful for offline review. | ✅ Decided |
| Q3 | Keystore: GitHub Codespaces vs one-shot workflow? (PRD Q12.3, CI Q20.1) | **One-shot GitHub Actions workflow** (`scripts/generate-keystore.yml`). User triggers it once from the Actions tab in the browser. Workflow generates keystore, base64-encodes it, prints it to the log (masked), and the user copies it into GitHub Secrets. No Codespaces needed. | ✅ Decided |
| Q4 | Diagnostics: always visible or behind toggle? (PRD Q12.4, CI Q20.3) | **Always visible** in Settings → Diagnostics. No toggle, no hidden tap gesture. This is non-negotiable given the no-local-debugger constraint. | ✅ Decided |
| Q5 | Snooze in persistent notification? (PRD Q12.5) | **No.** Explicitly excluded. Zero snooze/defer affordances anywhere in the app. This is a defining design constraint. | ✅ Auto-resolved |
| Q6 | Repository public or private? (PRD Q12.6, CI Section 3.2) | **Public.** Unlimited GitHub Actions minutes, easier APK access from phone. No credentials in code. | ✅ Decided |
| Q7 | `expo-sqlite` vs `react-native-quick-sqlite`? (SRS Section 3.3) | **`expo-sqlite` v14+.** Now uses JSI directly under the New Architecture. Officially maintained by Expo. No additional config friction. Simpler `expo prebuild` integration. | ✅ Decided |
| Q8 | Debug APK watermark? (CI Q20.2) | **Yes.** A subtle "DEBUG" banner rendered in the bottom-right corner of the Home screen when `__DEV__ === true` or `NODE_ENV !== 'production'`. Driven by a build-time constant injected via `babel-plugin-transform-inline-environment-variables`. | ✅ Decided |
| Q9 | iOS support? (CI Q20.4) | **Excluded entirely.** No `ios/` folder. No iOS prebuild. All CI workflows target `--platform android` only. iOS-specific code is never written. | ✅ Decided |
| Q10 | `developmentClient` in debug builds? (CI Section 8) | **`developmentClient: true`** for the `development` EAS profile. This is required because the custom notification listener native module cannot run in Expo Go. APK is ~30–40% larger but always supports custom native modules. | ✅ Auto-resolved |
| Q11 | `react-native-smtp-mailer` New Architecture support? | Verified: `react-native-smtp-mailer` does not support the New Architecture as of May 2026. **Replacement: `nodemailer` running in a Node.js-compatible Hermes environment via a custom service wrapper**, OR build a minimal custom Expo Module wrapping Android's `JavaMail` API. Decision: **custom Expo Module wrapping Android `JavaMail`** (F-13 scope). This is fully offline, avoids the legacy bridge problem, and has no third-party telemetry. | ✅ Auto-resolved |

---


## 1.2 Project Setup Approach

### Framework
- **Expo Development Build** (not bare React Native, not Expo Go).
  - Expo Go cannot run custom native modules. The notification listener module alone disqualifies it.
  - Bare React Native loses Expo's managed prebuild system, which is the mechanism we rely on to generate the `android/` folder in CI without a local machine.
  - Expo Development Build is the correct middle ground: managed config + custom native modules + full control.

### Architecture
- **New Architecture enabled:** `"newArchEnabled": true` in `app.json`. Required for TurboModule compatibility of the custom native module.
- **Hermes V1:** Default since RN 0.76, locked in by `"jsEngine": "hermes"` in `app.json`. No legacy JSC.
- **TypeScript strict mode:** `"strict": true` in `tsconfig.json`. `"noImplicitAny": true`, `"strictNullChecks": true`, all strict sub-flags enabled.

### Keystore Generation (Release Signing Without a Local Machine)
**Chosen approach: Option (b) — one-shot GitHub Actions workflow.**

A workflow file `.github/workflows/generate-keystore.yml` will be committed to the repo with `workflow_dispatch` trigger (manual only). When the user triggers it from the Actions tab:

1. Workflow runs `keytool -genkeypair` with hardcoded non-secret parameters (key algorithm RSA-2048, validity 10000 days, alias `taskmind-key`).
2. The keystore password and key password are passed in as `workflow_dispatch` inputs (they go into the log only briefly and are never stored in the workflow).
3. Workflow base64-encodes the `.keystore` file and prints it masked to the log.
4. A summary step instructs the user: "Copy the base64 output and add it as secret `ANDROID_KEYSTORE_BASE64`."
5. User adds the four secrets to GitHub → Settings → Secrets.
6. Workflow is run exactly once. The `.keystore` file never touches disk outside that ephemeral runner.

This is fully self-service from a phone browser and requires no Codespaces, no terminal, and no local tooling.

---

## 1.3 Module Build Order

The directory structure from SRS Section 3.2 must be scaffolded in dependency order. A layer cannot be built before its dependency is in place.

| Order | Directory / Module | Reason |
|---|---|---|
| 1 | `.github/workflows/` | CI must exist before anything is pushed |
| 2 | `android/` (generated by `expo prebuild`) | Native shell required for all subsequent native modules |
| 3 | `modules/notification-listener/` | Custom TurboModule; `android/` must exist first |
| 4 | `src/domain/entities/` | Core data contracts. Nothing else can type-check without them |
| 5 | `src/domain/validators/` | Used by use cases and extraction |
| 6 | `src/domain/usecases/` | Depend on entities and validators |
| 7 | `src/domain/extraction/` | Pure TS pipeline stages; depends on entities |
| 8 | `src/domain/learning/` | Depends on entities and extraction |
| 9 | `src/data/db/schema.ts` + `src/data/db/migrations/` | Drizzle schema; depends on domain entities for type alignment |
| 10 | `src/data/db/client.ts` | Depends on schema |
| 11 | `src/data/repositories/` | Depend on schema, client, and domain entities |
| 12 | `src/data/storage/` | MMKV wrappers; independent of DB |
| 13 | `src/services/` | Depend on repositories + domain + native modules |
| 14 | `src/state/` | Zustand stores; depend on services and repositories |
| 15 | `src/ui/theme/` | Design tokens; no dependencies |
| 16 | `src/ui/components/` | Depend on theme |
| 17 | `src/app/` (Expo Router screens) | Depend on components, state, services |
| 18 | `src/locales/` (en.json + hi.json) | Can be scaffolded anytime; needed before screens are complete |
| 19 | `assets/seed-keywords.json` | Seeder script depends on this file existing |
| 20 | `__tests__/` | Co-created with each module above |

**Justification for native-first ordering:** The `android/` folder and the `modules/notification-listener/` module must be committed before any feature work because every CI build needs them to compile. Discovering a Kotlin compilation error during Sprint 1 after 5 JS features have accumulated is much harder to debug than discovering it in Sprint 0.

---

## 1.4 Feature Sequencing

Features are sequenced with the following constraints:
- Phase 0 (CI) must be done before any app code.
- Native module (F-01) must be done before any feature that depends on notification data.
- Extraction (F-02) must be done before task creation is meaningful.
- Task CRUD (F-03) must be done before any UI feature involving tasks.
- Diagnostics screen is promoted to Sprint 2 (not Sprint 5) because it is essential for debugging the native module.

**Effort key:** S = 0.5–1 day | M = 1–2 days | L = 2–4 days | XL = 4–7 days

| Feature ID | Name | Effort | Prerequisites | Definition of Done |
|---|---|---|---|---|
| **Sprint 0 — Pipeline** | | | | |
| F-CI-01 | GitHub Actions Build Pipeline | M | Repo exists | 3 workflow files committed; debug APK builds on push; lint+test gates block merge |
| F-CI-02 | Automated Testing in CI | S | F-CI-01 | Jest runs in CI; coverage threshold enforced; test failure blocks merge |
| F-CI-03 | APK Artifact Publication & Signing | M | F-CI-01 | Debug APK as artifact with 30-day retention; release APK signed + GitHub Release on tag; keystore one-shot workflow committed |
| **Sprint 1 — Core Plumbing** | | | | |
| F-01 | Notification Listener Native Module | XL | F-CI-01, android/ committed | NLS captures notifications; foreground service starts on boot; Headless JS bridge fires; permissions flow works; verified on real device |
| F-02 | Rule-Based Task Extraction | L | F-01 (domain only, no RN deps) | 200+ seed keywords; pipeline stages unit tested; 500-sample corpus passes ≥85% accuracy |
| F-03 | Task CRUD | M | F-02, DB schema, repositories | Create/complete/delete/edit work; reactive query updates UI; soft-delete + 30-day retention; no snooze anywhere |
| **Sprint 2 — User-Facing MVP** | | | | |
| F-04 | Persistent Non-Dismissible Notification | L | F-01, F-03 | Cannot be swiped away; updates within 1s of task change; quick actions work; hides at zero tasks |
| F-05 | Priority System | S | F-02, F-03 | 4 levels; auto-assignment rules; manual override; VIP placeholder |
| Diagnostics Screen | In-app Diagnostics | M | F-01, F-02, F-03 | All 5 tabs functional; export as JSON works; always visible in Settings |
| Home Screen | Task list UI | M | F-03, F-05, theme | FlashList; swipe gestures; priority groups; stats strip; filter chips; empty state |
| Task Detail Screen | Detail view | S | Home Screen | All metadata visible; action bar; original message collapsible |
| Onboarding Flow | 7-screen onboarding | M | F-01, F-05 | Permission grant works; app selection works; VIP setup works; nudge config works |
| **Sprint 3 — Intelligence Layer 1** | | | | |
| F-06 | VIP Contact Auto-Urgent | S | F-03, F-05, Onboarding | VIP list management; case-insensitive match; URGENT auto-assigned; skips confirmation |
| F-07 | Confirmation Flow | M | F-02, F-03 | Heads-up notification; Confirmation Inbox screen; Yes/No actions update stats |
| F-08 | Periodic Nudges | M | F-03, F-05 | Notifee scheduled triggers; quiet hours; per-priority override; URGENT override |
| F-09 | History View | M | F-03 | Filters; stats card; date groups; search; restore option |
| **Sprint 4 — Integrations** | | | | |
| F-10 | Calendar Integration | S | F-03 | expo-calendar; permission at point of use; event ID stored; deep-link to calendar |
| F-11 | Meeting Transcript Import | M | F-02 | 50k char input; sentence segmentation; review list; batch save |
| F-12 | Export / Import | M | F-03 | CSV + JSON export; scoped export; import with merge/replace; share sheet |
| F-13 | Daily Email Report | L | F-03, custom JavaMail module | SMTP config; WorkManager job; HTML report; CSV attachment option; retry logic |
| **Sprint 5 — Adaptive Intelligence** | | | | |
| F-14 | On-Device ML Model (ONNX) | XL | F-02 | Model download; SHA-256 verify; inference <500ms; combined score; fallback to rules |
| F-15 | Sender Reputation | M | F-03, F-07 | Per-sender stats tracked; confidence adjustment after ≥5 samples |
| F-16 | Learned Vocabulary System | M | F-02, F-07, F-15 | N-gram extraction; promotion at freq≥3; demotion on deletions |
| F-17 | Learned Vocabulary UI | S | F-16 | Active/Pending/Demoted tabs; manual remove; frequency displayed |
| **Sprint 6 — Polish & Hardening** | | | | |
| F-18 | Discarded Log Enhancements | S | F-02, Diagnostics | 500-entry rolling log; manual promote; export; in Diagnostics tab |
| F-19 | Automated Backup | M | F-12 | Weekly job; JSON format; 4-backup rotation; folder picker |
| F-20 | OEM Battery Guide | S | F-01 | Manufacturer detection; step-by-step cards; deep-link to OEM settings |
| Performance Pass | — | M | All Sprint 5 | Cold start <2.5s; 60fps scroll; RAM <200MB; JS bundle <8MB |
| Accessibility Audit | — | S | All screens | TalkBack pass; 200% font scaling; contrast verified |
| Final UAT | — | S | All features | AT-01 through AT-CI-04 from SRS Section 8.3 all pass on real device |

---


## 1.5 Custom Notification Listener Native Module Plan

This is the highest-risk component. Full design documented here to front-load all architectural decisions before a single line of Kotlin is written.

### Why a Custom Module is Required
No maintained React Native library supports `NotificationListenerService` under the New Architecture. `react-native-android-notification-listener` is 2+ years stale and uses the legacy bridge. A custom local Expo Module is the only viable path.

### TypeScript Interface (Module API Surface)

```typescript
// modules/notification-listener/src/index.ts

export interface NotificationData {
  packageName: string;   // e.g., "com.whatsapp"
  appName: string;       // e.g., "WhatsApp" (resolved via PackageManager)
  title: string;         // Notification title (sender name for messaging apps)
  text: string;          // Short text
  bigText: string;       // Expanded text (more content from messaging apps)
  subText: string;       // e.g., group name
  postTime: number;      // Epoch milliseconds
  isGroup: boolean;      // Heuristic: subText non-empty or group key present
}

export interface PersistentNotificationParams {
  pendingCount: number;
  urgentCount: number;
  topTaskText: string;
  secondTaskText: string | null;
}

export interface NotificationListenerModule {
  // Permission
  getPermissionStatus(): Promise<'granted' | 'denied' | 'unknown'>;
  openPermissionSettings(): Promise<void>;

  // Service lifecycle
  startService(): Promise<void>;
  stopService(): Promise<void>;
  isServiceRunning(): Promise<boolean>;

  // Monitored apps allowlist (written to SharedPreferences for native-layer filtering)
  setMonitoredApps(packageNames: string[]): Promise<void>;
  getMonitoredApps(): Promise<string[]>;

  // Persistent notification (foreground service notification)
  updatePersistentNotification(params: PersistentNotificationParams): Promise<void>;
  hidePersistentNotification(): Promise<void>;

  // Event listeners (Expo Modules EventEmitter pattern)
  addListener(
    eventName: 'onNotification' | 'onQuickActionDoneTop' | 'onQuickActionOpen',
    listener: (data: NotificationData | null) => void
  ): { remove: () => void };
}
```

### Android Implementation Classes

**1. `TaskMindNotificationListenerService.kt`**
- Extends `android.service.notification.NotificationListenerService`.
- `onNotificationPosted()`: reads extras, filters against monitored-apps set (stored in `SharedPreferences`), deduplicates using a `LinkedHashMap<String, Long>` keyed by `"$packageName|$title|$text"` with 5-second TTL, then fires a Headless JS task.
- `onListenerConnected()`: starts `TaskMindForegroundService` if not already running.
- Registered in `AndroidManifest.xml` with `BIND_NOTIFICATION_LISTENER_SERVICE` permission.

**2. `TaskMindForegroundService.kt`**
- Extends `android.app.Service`.
- `onStartCommand()`: calls `startForeground(NOTIFICATION_ID, buildPersistentNotification(...))`.
- `buildPersistentNotification()`: uses `Notification.Builder` with `FLAG_ONGOING_EVENT | FLAG_NO_CLEAR`. BigTextStyle for top 2 tasks. Two `PendingIntent`s for "Open" (launch app) and "Done Top" (broadcast to `QuickActionReceiver`).
- `updateNotification(params)`: called from `NotificationModule` when task state changes. Rebuilds and posts via `NotificationManager`.
- Channel: `persistent_status`, importance `IMPORTANCE_LOW`.

**3. `NotificationModule.kt`**
- Expo Module (implements `ExpoModule` from `expo-modules-core`).
- Exposes all TypeScript API methods above as `AsyncFunction` and `Function` definitions.
- Sends events via Expo Modules `sendEvent()` pattern (replaces legacy `RCTEventEmitter`).
- Calls `TaskMindForegroundService` via `startService(Intent(...))`.

**4. `BootReceiver.kt`**
- Extends `BroadcastReceiver`.
- Receives `BOOT_COMPLETED` and `QUICKBOOT_POWERON` (for Xiaomi).
- Calls `context.startForegroundService(Intent(context, TaskMindForegroundService::class.java))`.

**5. `QuickActionReceiver.kt`**
- Extends `BroadcastReceiver`.
- Receives `ACTION_DONE_TOP` and `ACTION_OPEN` from `PendingIntent` quick actions.
- `ACTION_DONE_TOP`: fires a Headless JS task `TaskMindQuickAction` with `{ action: 'doneTop' }`, so JS layer can complete the top-priority task.
- `ACTION_OPEN`: calls `context.startActivity(launchIntent)`.

### Headless JS Bridge Design

```
[onNotificationPosted] 
    → filter by monitored apps (native)
    → deduplicate (native, 5s window)
    → HeadlessJsTaskService.acquireWakeLockNow()
    → startService(HeadlessJsIntent with NotificationData as JSON extra)
    
[JS: src/services/notification-handler.ts — registered as AppRegistry headless task]
    → deserialize NotificationData
    → run extraction pipeline (pure TS, synchronous)
    → if confidence >= 0.40: write task to DB via repository
    → update persistent notification via NotificationModule.updatePersistentNotification()
    → log extraction decision to diagnostics log
    → return (task finishes, wake lock released)
```

The foreground service guarantees the JS runtime is alive when the headless task fires. This is the critical insight: the foreground service is not just for the persistent notification — it also functions as the process-keep-alive that makes headless JS reliable.

### Testing Strategy

**Unit testable (Jest):**
- The extraction pipeline is pure TypeScript. 100% testable without native mocks.
- The deduplication logic can be extracted to a pure TypeScript function and tested.
- The notification filter (monitored-apps check) can be tested against a mock settings store.

**Integration testing (not feasible without native layer):**
- The Kotlin→JS bridge cannot be unit tested in Jest. It requires a running Android runtime.
- Strategy: write a comprehensive integration test suite that runs after the first real-device install.

**Manual test protocol (to be executed after every F-01 build):**

| Step | Action | Expected Result |
|---|---|---|
| MT-01 | Install debug APK; complete onboarding; grant NLS permission | No crash; foreground service visible in notification shade |
| MT-02 | Reboot device | Foreground service restarts within 30s; persistent notification reappears |
| MT-03 | Send WhatsApp message to self: "kal tak report bhej dena" | Task appears in app within 3s; priority MEDIUM or HIGH |
| MT-04 | Send WhatsApp message: "lol thanks" | No task created; item appears in Diagnostics → Discarded |
| MT-05 | Tap "Done Top" in persistent notification | Highest-priority task marked complete; notification updates |
| MT-06 | Enable airplane mode, receive SMS | SMS notification captured (no network needed) |
| MT-07 | Force-stop app via Settings | Foreground service restarts within 30s (OEM dependent) |
| MT-08 | Add app to battery whitelist per F-20 guide | Service survives aggressive battery optimization |

**CI smoke test (automated, runs after every debug build):**
- The APK is installed on an Android emulator in CI.
- `adb shell am start -n com.taskmind.app/.MainActivity` — verifies app launches.
- `adb shell am broadcast -a android.intent.action.BOOT_COMPLETED` — verifies boot receiver fires.
- Full NLS testing on emulator is not feasible (NLS requires real device grant), so this is a launch smoke test only.

### Fallback Plan for New Architecture API Changes

If the Expo Modules API surface changes between Expo SDK versions:
1. The module interface (`src/index.ts`) is version-pinned via the `expo-modules-core` version in `package.json`.
2. The module has an `expo-module.config.json` that specifies the minimum SDK version.
3. Any breaking change is caught at `expo prebuild` time (CI), not at runtime.
4. Fallback: if a breaking change is discovered, pin the Expo SDK version and file an issue against the Expo Modules API. The module is self-contained in `modules/notification-listener/` and can be patched without touching the rest of the codebase.

---


## 1.6 Schema Migration Strategy

### Tooling
- **Drizzle ORM** with **Drizzle Kit** for migration file generation.
- Database: `expo-sqlite` v14+ (JSI-based, New Architecture native).
- All schema defined in `src/data/db/schema.ts` as typed Drizzle table definitions.

### Migration Workflow

1. **Schema changes in `schema.ts`** are made during feature development.
2. Developer (Kiro) runs `npm run db:generate` which calls `drizzle-kit generate:sqlite`. This produces a numbered SQL migration file in `src/data/db/migrations/` (e.g., `0001_add_sender_stats.sql`).
3. **Migration files are committed to the repo.** They are part of the source of truth for the database schema.
4. On app startup, `src/data/db/client.ts` calls `migrate(db, { migrationsFolder: './src/data/db/migrations' })` — Drizzle's built-in migrator runs all pending migrations in order.
5. Migration state is tracked in a `__drizzle_migrations` table automatically managed by Drizzle.

### Rules
- **No raw SQL schema changes.** All changes go through `schema.ts` → `drizzle-kit generate`.
- **Never edit migration files after they are committed.** Create a new migration to fix mistakes.
- **Breaking migrations (column drops, type changes) require a data migration script** in `scripts/` to preserve user data. Document the migration in an ADR.
- **Zero-migration schema changes** (adding nullable columns with defaults, adding indexes) are safe for existing users.

### Migration Test Strategy

Every migration is tested using an **in-memory SQLite database** in Jest:

```typescript
// __tests__/data/migrations.test.ts
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import migrations from '../../src/data/db/migrations';

test('all migrations apply cleanly to a fresh database', async () => {
  const sqlite = openDatabaseSync(':memory:');
  const db = drizzle(sqlite);
  await expect(migrate(db, migrations)).resolves.not.toThrow();
});

test('migrations are idempotent (running twice is safe)', async () => {
  const sqlite = openDatabaseSync(':memory:');
  const db = drizzle(sqlite);
  await migrate(db, migrations);
  await expect(migrate(db, migrations)).resolves.not.toThrow();
});
```

These tests run in the `test` CI job on every push. A migration that breaks a fresh install is caught before the APK is built.

### Initial Schema Seeding

After running migrations, the `seed-db.ts` script inserts:
- All seed keywords from `assets/seed-keywords.json` into the `seed_keywords` table.
- Default monitored apps (WhatsApp, SMS, Gmail, Slack, Teams, Telegram) into `monitored_apps`.

Seeding is idempotent: uses `INSERT OR IGNORE` to prevent duplicates on re-run. The seeder runs once on first app launch via a flag in MMKV (`db_seeded: boolean`).

---

## 1.7 Testing Strategy Per Layer

### Overview

| Layer | Tool | Target Coverage | Test Type |
|---|---|---|---|
| `src/domain/` | Jest | ≥70% lines + functions | Unit |
| `src/domain/extraction/` | Jest + corpus | ≥85% pipeline accuracy | Unit + corpus |
| `src/data/` (repositories) | Jest + in-memory SQLite | ≥70% | Integration |
| `src/services/` | Jest + mocks | ≥70% of logic branches | Unit (fixture-based) |
| `src/app/` (critical screens) | React Native Testing Library | Critical flows only | Component |
| E2E | Detox (post-MVP) | Critical flows on emulator | E2E |
| Manual | Real device | All acceptance tests | Manual |

### Domain Layer (`src/domain/`)

**Target: ≥70% line and function coverage. No exceptions.**

- All use cases (`CreateTask`, `CompleteTask`, `DeleteTask`, `AssignPriority`, etc.) have exhaustive unit tests.
- Tests use the Result/Either pattern — verify both success and failure paths.
- No mocking of domain internals. Test behavior, not implementation.
- Test file colocation: `src/domain/usecases/__tests__/CreateTask.test.ts`.

**Extraction pipeline specifically:**
- Each stage (`LanguageDetector`, `Preprocessor`, `RuleEngine`, `PriorityAssigner`, `ActionExtractor`, `ConfidenceAggregator`) is tested as a pure function.
- A labeled corpus of 500+ samples (JSON, committed to `__tests__/extraction/corpus/`) is loaded and run against the pipeline. Target: ≥85% accuracy.
- Corpus format: `{ input: string, sourceApp: string, expectedDecision: 'CREATE' | 'CONFIRM' | 'DISCARD', expectedPriority?: Priority }[]`
- Build the corpus incrementally: 50 samples in Phase 2, 200 in Phase 3, 500 in Phase 4.

### Data Layer (`src/data/`)

**Target: ≥70% integration test coverage of repository methods.**

- Each repository method has an integration test using an in-memory `expo-sqlite` database with migrations applied.
- Tests verify: data is written correctly, indexes work, reactive queries update, soft-delete retains rows, 30-day cleanup runs.

```typescript
// Example: __tests__/data/TaskRepository.test.ts
describe('TaskRepository.createTask', () => {
  let repo: TaskRepository;
  
  beforeEach(async () => {
    const sqlite = openDatabaseSync(':memory:');
    const db = drizzle(sqlite);
    await migrate(db, migrations);
    repo = new TaskRepository(db);
  });

  it('persists a task with correct fields', async () => {
    const input = { text: 'Test task', priority: 'HIGH', ... };
    const task = await repo.createTask(input);
    expect(task.id).toBeDefined();
    expect(task.status).toBe('PENDING');
  });
});
```

### Service Layer (`src/services/`)

**Strategy: Fixture-based unit tests with mocked repositories and native module stubs.**

- Services are tested by injecting mock implementations of their dependencies (repositories, native modules).
- `notification-handler.ts` is tested with mock `ExtractionPipeline` and mock `TaskRepository`.
- `email-sender.ts` is tested by mocking the native JavaMail module and asserting the correct payload is produced.
- Services that schedule jobs (nudge-scheduler, backup) are tested by asserting that the correct Notifee/WorkManager calls are made with correct parameters.

### UI Layer (`src/app/`)

**Strategy: React Native Testing Library for critical flows only. Not chasing coverage here.**

Critical flows warranting RNTL tests:
1. Task swipe-complete gesture.
2. Confirmation "Yes, Add" action updates task list.
3. Transcript import review → batch save.
4. Settings SMTP save → encrypted MMKV write (mock MMKV).

All other UI is tested manually via APK installs. Do not write RNTL tests for screens that are primarily visual.

### E2E Layer (Detox, post-MVP)

Deferred to after MVP release. Will run on an Android emulator in CI on the `build-debug.yml` workflow (separate job, triggered only on PRs to main, not on every push).

Critical flows for E2E:
1. Onboarding → permission grant → home screen.
2. Receive notification (mocked via `adb shell am broadcast`) → task appears.
3. Complete task via swipe → history screen.

### Manual Testing Protocol

After every debug APK build that introduces a new feature, execute:
1. Install APK from GitHub Actions artifact (tap and install on device).
2. Run feature-specific test cases from SRS Section 8.3.
3. Verify Diagnostics screen captures relevant events.
4. File any bugs as GitHub Issues with the Diagnostics export attached.

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo|@expo|@shopify/flash-list|react-native-reanimated|@notifee|drizzle-orm|react-native-mmkv)'
  ],
  coverageThreshold: {
    'src/domain/**': { lines: 70, functions: 70, branches: 60 },
    'src/services/extraction/**': { lines: 70, functions: 70, branches: 60 }
  },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

---


## 1.8 CI Pipeline Detailed Plan

Three workflow files implement the full CI/CD pipeline. All quality gates run exclusively in GitHub Actions — no pre-commit hooks, no local checks.

### Workflow 1: `.github/workflows/ci.yml` — Lint and Test

**Trigger:** Every push to non-main branches; every PR targeting main.

**Jobs:**

| Job | Steps | Timeout |
|---|---|---|
| `lint` | checkout → setup-node (`.tool-versions`) → `npm ci` → ESLint → Prettier check → `tsc --noEmit` | 10 min |
| `test` | checkout → setup-node → `npm ci` → `jest --coverage --maxWorkers=2` → upload coverage artifact → coverage threshold check | 15 min |

**Cache keys:**
- npm: `npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}` — expected hit rate ~90% (only misses when `package-lock.json` changes)
- No Gradle cache in this workflow (no APK build)

**Concurrency:** `cancel-in-progress: true` per branch — stale CI runs are killed when a new push arrives.

**Coverage threshold enforcement:** `jest --coverage --coverageThreshold` is configured in `jest.config.js`. If `src/domain/` falls below 70%, the job exits non-zero. The PR cannot be merged until the threshold is met.

### Workflow 2: `.github/workflows/build-debug.yml` — Debug APK

**Trigger:** Every push to any branch (after lint+test pass via `needs`). Manual via `workflow_dispatch`.

**Jobs:**

| Job | Steps | Notes |
|---|---|---|
| `build` | checkout → setup-node → setup-java 17 (Temurin) → setup-android@v3 → cache Gradle → expo-github-action@v8 → `npm ci` → generate version info → `eas build --platform android --profile development --local --non-interactive` → rename APK → upload artifact → write summary | 30 min timeout |

**Cache keys:**
- npm: same as ci.yml
- Gradle: `gradle-${{ runner.os }}-${{ hashFiles('android/**/*.gradle*', 'android/**/gradle-wrapper.properties') }}` — expected hit rate ~80% (stable until native dependencies change)

**APK artifact:**
- Name: `taskmind-debug-{branch}-{short-sha}`
- Path: `taskmind-debug-{branch}-{short-sha}.apk`
- Retention: 30 days
- **GitHub Step Summary** writes user-friendly install instructions visible on phone browser

**Failure artifacts:** On any step failure, always upload:
```yaml
- name: Upload failure logs
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: failure-logs-${{ github.run_id }}
    path: |
      android/app/build/reports/
      /tmp/eas-build-*.log
    retention-days: 7
```

**Expected build times:**
- Cold (no cache): ~18–22 minutes
- Warm (Gradle cache hit): ~10–14 minutes
- Target: <25 minutes. Comfortable with warm cache.

### Workflow 3: `.github/workflows/build-release.yml` — Signed Release APK

**Trigger:** Push to tag matching `v*`.

**Required GitHub Secrets:**
- `ANDROID_KEYSTORE_BASE64` — base64 of release `.keystore`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` (`taskmind-key`)
- `ANDROID_KEY_PASSWORD`

**Jobs:**

| Step | Detail |
|---|---|
| Decode keystore | `echo "$KEYSTORE_BASE64" \| base64 -d > ./android/app/release.keystore` |
| Build release APK | `eas build --platform android --profile production --local --non-interactive` |
| Verify signing | `$ANDROID_HOME/build-tools/34.0.0/apksigner verify --verbose ./taskmind-{tag}.apk` |
| Extract release notes | `awk` extracts the relevant section from `CHANGELOG.md` |
| Create GitHub Release | `softprops/action-gh-release@v2` creates Release with APK attached |
| Cleanup keystore | `rm -f ./android/app/release.keystore` — always runs even on failure |

**Permissions:** `contents: write` (required to create GitHub Releases).

**Cache keys:** Same as build-debug.yml. Cache is shared between debug and release workflows (same key).

### Additional Workflow: `.github/workflows/generate-keystore.yml`

**Trigger:** `workflow_dispatch` only. Run once, manually.

**Inputs:** `keystore_password` (string, required), `key_password` (string, required).

**Steps:**
1. Setup Java 17.
2. `keytool -genkeypair -v -keystore taskmind.keystore -alias taskmind-key -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=TaskMind,O=Personal,C=IN" -storepass ${{ inputs.keystore_password }} -keypass ${{ inputs.key_password }}`
3. `base64 taskmind.keystore` — output written to step summary.
4. Step summary instructs user to copy the base64 string into `ANDROID_KEYSTORE_BASE64` GitHub Secret.
5. Cleanup: `rm -f taskmind.keystore`.

### Cache Hit Rate Analysis

| Cache | Expected Hit Rate | Miss Scenario |
|---|---|---|
| npm (`node_modules`) | ~90% | `package-lock.json` updated |
| Gradle wrapper | ~95% | Gradle version bump |
| Gradle caches | ~80% | New native dependency added |
| Android SDK | ~99% | `setup-android@v3` handles caching internally |

Overall: warm builds are consistently under 15 minutes. Cold builds (first run, cache evicted) under 22 minutes. Both within the 25-minute budget.

---

## 1.9 Branching Strategy

### Model: Trunk-Based Development with Short-Lived Feature Branches

```
main (protected)
├── feature/F-CI-01-build-pipeline
├── feature/F-CI-02-test-ci
├── feature/F-01-notification-listener
├── feature/F-02-rule-extraction
├── feature/F-03-task-crud
└── ...
```

### Branch Naming
- Feature branches: `feature/F-{id}-{short-name}` (e.g., `feature/F-04-persistent-notification`)
- Bug fix branches: `fix/{issue-number}-{short-name}` (e.g., `fix/42-boot-receiver-crash`)
- Chore/infra: `chore/{short-name}` (e.g., `chore/upgrade-expo-55`)
- Release: No release branches. Tags on `main` only.

### Commit Convention (Conventional Commits)

```
feat(F-04): persistent non-dismissible notification with quick actions
fix(F-01): boot receiver misses QUICKBOOT_POWERON on Xiaomi
chore: upgrade expo-sqlite to 14.1.0
test(F-02): add 200-sample corpus for Hinglish extraction
docs: update README with keystore setup instructions
refactor(F-03): extract soft-delete logic to TaskRepository
```

- Scope is the Feature ID where applicable.
- One concern per commit. No "misc fixes" commits.
- `!` suffix for breaking changes: `feat(F-03)!: rename task status REMOVED → DELETED`

### PR Rules
Every PR must:
1. Pass `lint` job (ESLint + Prettier + TypeScript)
2. Pass `test` job (Jest with coverage threshold)
3. Successfully build a debug APK in `build-debug.yml`
4. Fill in the PR template (Feature ID, FR-IDs covered, testing notes)
5. Reference relevant GitHub Issues in description
6. Have `CHANGELOG.md` updated under `[Unreleased]`

### Merge Strategy
- **Squash and merge** for feature branches — one commit per feature on `main`.
- **Rebase** for chore/fix branches when history clarity matters.
- **No merge commits.** Linear history enforced by branch protection.
- Auto-delete branch after merge (configured in repo settings).

### Tagging Convention
- `v0.1.0-pipeline` — Sprint 0 complete, CI working
- `v0.2.0-plumbing` — Sprint 1 complete, notification listener working
- `v1.0.0-mvp` — Sprint 2+3 complete, all P0 features
- `v1.1.0` — Sprint 4 complete, integrations
- `v1.2.0` — Sprint 5 complete, adaptive intelligence
- `v1.3.0` — Sprint 6 complete, polish

---


## 1.10 Risk Register

Top 10 risks, ranked by combined likelihood × impact. Owner is always Kiro (implementation) with escalation to RJ (product decisions).

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | **Custom NLS native module fails to compile or bridge to JS under New Architecture** | High | Critical | Front-load F-01 in Sprint 1. Write skeleton Kotlin first (empty NLS that just logs). Get it compiling in CI before adding logic. Commit `android/` folder after prebuild so CI never re-generates it. Fallback: legacy bridge wrapper as temporary measure if New Arch surface area changes. | Kiro |
| 2 | **Foreground service killed by OEM battery optimization (Xiaomi, OPPO, Realme)** | High | High | F-20 OEM Battery Guide built early (Sprint 6). Notify user during onboarding with direct deep-link to battery settings. Use both `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_DATA_SYNC` permission types. `BOOT_COMPLETED` + `QUICKBOOT_POWERON` receivers. Document in `docs/debugging-without-ide.md`. | Kiro + RJ |
| 3 | **No local debug loop — Kotlin errors require full CI rebuild to test (10–22 min/iteration)** | Certain | High | Mitigations: (a) Write all Kotlin defensively — null-safe, explicit error handling, verbose logs. (b) Test logic in Kotlin unit tests where possible before bridging. (c) Use GitHub Actions `workflow_dispatch` for isolated native-only builds. (d) Diagnostics screen captures all runtime state. | Kiro |
| 4 | **`eas build --local` fails on GitHub runner due to SDK/JDK version mismatch or OOM** | Medium | High | Pin exact tool versions in `.tool-versions`. Use `setup-java@v4` with `distribution: temurin` and explicit `java-version: 17`. Use `setup-android@v3` which provides pre-cached SDK. Gradle daemon disabled in CI (`--no-daemon`). Set Gradle JVM args: `-Xmx4g -XX:MaxMetaspaceSize=512m`. Upload Gradle build reports on failure. | Kiro |
| 5 | **`@notifee/react-native` breaking change in a future version affecting nudge scheduling** | Low | Medium | Pin `@notifee/react-native` version in `package.json`. Monthly upgrade window only. Test nudge scheduling manually after every upgrade. Alternative: Expo's native `expo-notifications` for basic scheduling if Notifee breaks. | Kiro |
| 6 | **WhatsApp changes notification format (e.g., encrypts text, moves sender)** | Low | High | Capture full `Bundle` extras in native layer, not just known fields. Log everything in Diagnostics. `rawSourceText` stores original. Rule engine trained on `title + text + bigText` combined — resilient to field movement. | Kiro |
| 7 | **ONNX model download fails silently or partial file results in corrupt inference** | Low | Medium | SHA-256 checksum verification after download. Partial downloads detected by file size check. App falls back to rule-only mode on any model error (degraded, not broken). Model download is optional at onboarding. | Kiro |
| 8 | **Drizzle migration breaks on device upgrade from old to new APK version** | Low | High | All migration files committed to repo. Drizzle migrator runs on first launch after upgrade. Migration tests run in CI with in-memory SQLite. Breaking migrations require data migration scripts. Always test with migration from v0 schema on CI before release. | Kiro |
| 9 | **Hindi/Hinglish false positive rate too high in early releases** | Medium | Medium | Ship with 200+ seed keywords. Confirmation flow acts as a safety valve — low-confidence tasks go to confirmation queue before being added. Learning system improves over 2 weeks of use. Diagnostics → Discarded log lets RJ review false positives and provide feedback as GitHub issues. | Kiro + RJ |
| 10 | **GitHub Actions quota exhaustion (private repo scenario)** | Low | Low | Repo is public — unlimited minutes. If ever made private: upgrade to GitHub Pro ($4/month) for 3000 min/month. Monitor usage in repo Insights → Actions. Alert RJ if approaching 80% of monthly quota. | Kiro |

---

## 1.11 Tooling & Dependency Inventory

### `.tool-versions` (runtime versions, pinned)

```
nodejs 20.18.0
java temurin-17.0.10+7
```

### `package.json` — Pinned Dependencies

All versions pinned (no `^` or `~`). Justification provided per dependency.

**Core React Native / Expo:**
```json
"react": "18.3.1",
"react-native": "0.85.0",
"expo": "55.0.0",
"expo-router": "4.0.0",
"expo-dev-client": "5.0.0",
"expo-build-properties": "0.13.0",
"expo-font": "13.0.0",
"expo-splash-screen": "0.29.0",
"expo-status-bar": "2.0.0"
```

**Database / Storage:**
```json
"expo-sqlite": "14.0.0",
"drizzle-orm": "0.36.0",
"drizzle-kit": "0.28.0",
"react-native-mmkv": "3.1.0"
```
*Justification: `expo-sqlite` v14 = JSI-based, New Arch native. Drizzle is the only type-safe SQLite ORM with Expo integration. MMKV is the only performant synchronous KV store compatible with New Arch.*

**Notifications:**
```json
"@notifee/react-native": "9.1.0",
"expo-background-fetch": "12.0.0"
```
*Justification: Notifee is the only library with advanced notification channels, triggers, and quick actions under New Arch. `expo-background-fetch` for WorkManager-backed scheduled jobs.*

**UI / Components:**
```json
"react-native-reanimated": "3.16.0",
"react-native-gesture-handler": "2.20.0",
"@shopify/flash-list": "1.7.1",
"@gorhom/bottom-sheet": "5.0.6",
"react-native-svg": "15.8.0",
"lucide-react-native": "0.468.0",
"expo-haptics": "14.0.0",
"expo-image": "2.0.0"
```
*Justification: Reanimated 3 = worklet-only animations (required). GestureHandler = swipe gestures. FlashList = required (no FlatList). BottomSheet = filter/options sheets. SVG for illustrations. Lucide = consistent icon library.*

**Forms / State:**
```json
"react-hook-form": "7.54.0",
"zustand": "5.0.2",
"@tanstack/react-query": "5.62.0"
```
*Justification: react-hook-form for all forms. Zustand for UI state. TanStack Query for reactive DB subscriptions pattern.*

**Device / System:**
```json
"react-native-device-info": "11.4.0",
"expo-calendar": "13.0.0",
"expo-file-system": "18.0.0",
"expo-sharing": "12.0.0"
```
*Justification: device-info for OEM detection (F-20). expo-calendar for F-10. file-system + sharing for F-12 export/import.*

**i18n:**
```json
"i18next": "23.16.8",
"react-i18next": "15.1.3"
```
*Justification: i18next is the standard. No cloud dependency. Fully offline.*

**ML (Phase 4 only — not in Phase 2 scaffold):**
```json
"onnxruntime-react-native": "1.21.0"
```
*Justification: Only maintained ONNX runtime for React Native. New Arch compatible.*

**Error Handling:**
```json
"react-native-exception-handler": "2.10.10"
```
*Justification: Catches uncaught JS errors, writes crash log to storage for Diagnostics export. No network calls.*

**Dev Dependencies:**
```json
"typescript": "5.7.2",
"@typescript-eslint/eslint-plugin": "8.18.0",
"@typescript-eslint/parser": "8.18.0",
"eslint": "9.17.0",
"eslint-plugin-react-native": "4.1.0",
"prettier": "3.4.2",
"jest": "29.7.0",
"jest-expo": "55.0.0",
"@testing-library/react-native": "12.9.0",
"@testing-library/jest-native": "5.4.3",
"babel-plugin-transform-inline-environment-variables": "0.4.4",
"tsx": "4.19.2"
```

### New Architecture Compatibility Audit

| Library | New Arch Compatible? | Notes |
|---|---|---|
| `expo-sqlite` v14+ | ✅ Yes | JSI-based since v14 |
| `drizzle-orm` | ✅ Yes | Pure JS/TS, no native code |
| `react-native-mmkv` v3+ | ✅ Yes | TurboModule since v3 |
| `@notifee/react-native` v9+ | ✅ Yes | New Arch support added in v7+ |
| `react-native-reanimated` v3+ | ✅ Yes | Fabric-compatible since v3 |
| `react-native-gesture-handler` v2+ | ✅ Yes | Fabric-compatible since v2 |
| `@shopify/flash-list` v1.7+ | ✅ Yes | Fabric-compatible |
| `@gorhom/bottom-sheet` v5+ | ✅ Yes | Rewritten for New Arch in v5 |
| `react-native-device-info` v11+ | ✅ Yes | TurboModule in v11 |
| `expo-calendar` | ✅ Yes | Expo-maintained, New Arch |
| `expo-file-system` | ✅ Yes | Expo-maintained, New Arch |
| `expo-sharing` | ✅ Yes | Expo-maintained, New Arch |
| `onnxruntime-react-native` v1.20+ | ✅ Yes | New Arch support confirmed |
| `react-native-exception-handler` | ⚠️ Check | Last release 2022 — evaluate at F-18 time; fallback is custom JS `ErrorUtils` override |
| `lucide-react-native` | ✅ Yes | Pure SVG, no native code |
| `i18next` / `react-i18next` | ✅ Yes | Pure JS |
| `react-hook-form` | ✅ Yes | Pure JS |
| `zustand` | ✅ Yes | Pure JS |
| `@tanstack/react-query` | ✅ Yes | Pure JS |
| Custom NLS Expo Module | ✅ Yes (by design) | Built on Expo Modules API = TurboModule |

**`react-native-exception-handler` is the only uncertain library.** If it proves incompatible, the fallback is:
```typescript
// Polyfill — set in index.js before AppRegistry
const oldHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  writeCrashLogToStorage(error); // writes to MMKV or file
  oldHandler(error, isFatal);
});
```

---

## 1.12 Diagnostics Screen Design

The Diagnostics screen is non-negotiable for this project. Without it, every bug requires a CI rebuild and a real-device install to investigate — a 15-minute minimum feedback cycle. The Diagnostics screen compresses that to seconds.

### Location and Access
- Path: Settings → Diagnostics (always visible, no toggle, no hidden gesture)
- Route: `/settings/diagnostics` in Expo Router
- Icon: wrench or activity monitor icon (Lucide `Activity`)

### 5 Tabs

**Tab 1: Notifications**
- Title: "Recent Notifications"
- Content: Last 50 captured notifications (ring buffer, stored in memory + MMKV on rotation)
- Per row:
  - Timestamp (relative + absolute)
  - App icon + package name
  - Title (truncated, expandable on tap)
  - Text (truncated)
  - Status chip: PASSED_FILTER / FILTERED_OUT / DEDUPLICATED
- Tap any row: full-screen detail view with raw JSON

**Tab 2: Extraction**
- Title: "Extraction Decisions"
- Content: Last 50 extraction decisions
- Per row:
  - Input text (truncated)
  - Language detected badge (EN / HI / HI-EN)
  - Rule score + model score (if available) + final score
  - Decision chip: CREATED / CONFIRM / DISCARDED
  - Matched keywords (comma-separated chips, color-coded by category)
- Tap any row: full-screen breakdown with all pipeline stage outputs

**Tab 3: Discarded**
- Title: "Discarded Log"
- Content: All 500 entries from `discarded_log` table (scrollable, paginated)
- Per row: text, source app, sender, confidence, reason (LOW_CONFIDENCE / ANTI_PATTERN / TOO_SHORT), timestamp
- Action: "Promote to Task" button on each row (opens create task pre-filled with this text)
- Filter: by reason type
- Note: this tab IS the F-18 feature; it's built in Sprint 2 (earlier than the PRD's Sprint 6 placement) because it's needed for debugging

**Tab 4: DB Stats**
- Title: "Database"
- Content:
  - Row count per table (live query via Drizzle)
  - Total DB file size (via `expo-file-system`)
  - Last migration run timestamp
  - MMKV keys list with value preview (truncated, secrets redacted)

**Tab 5: System**
- Title: "System Info"
- Content:
  - App version + build number
  - Git commit SHA (injected at build time via `babel-plugin-transform-inline-environment-variables`)
  - React Native version
  - Expo SDK version
  - Hermes version
  - Device model + manufacturer (via `react-native-device-info`)
  - Android version + API level
  - Permissions status: NLS granted?, POST_NOTIFICATIONS?, SCHEDULE_EXACT_ALARM?, calendar?
  - Foreground service status: running / stopped
  - NLS service status: connected / disconnected

### How Notifications Are Captured for Inspection

```typescript
// src/services/diagnostics-logger.ts
const BUFFER_SIZE = 50;
let notificationBuffer: CapturedNotification[] = [];

export function logCapturedNotification(data: NotificationData, status: 'PASSED' | 'FILTERED' | 'DEDUPLICATED') {
  notificationBuffer = [{ ...data, status, capturedAt: Date.now() }, ...notificationBuffer].slice(0, BUFFER_SIZE);
  // Persist to MMKV for survival across JS restarts
  settingsStore.set('diag_notification_buffer', JSON.stringify(notificationBuffer));
}
```

Called from `notification-handler.ts` (the Headless JS task) on every received notification, before and after the monitored-apps filter.

### How Extraction Decisions Are Logged

```typescript
// src/services/diagnostics-logger.ts
export function logExtractionDecision(decision: ExtractionDecision) {
  // ExtractionDecision includes: input, language, ruleScore, modelScore,
  // finalScore, matchedKeywords, pipelineStages[], decision, timestamp
  extractionBuffer = [decision, ...extractionBuffer].slice(0, BUFFER_SIZE);
  settingsStore.set('diag_extraction_buffer', JSON.stringify(extractionBuffer));
}
```

The extraction pipeline calls this at the `ConfidenceAggregator` stage with the full decision object.

### Export Format

The "Export Diagnostics" button (top-right icon in Diagnostics app bar) calls:

```typescript
async function exportDiagnostics(): Promise<void> {
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version,
    commitSha: process.env.EXPO_PUBLIC_COMMIT_SHA,
    device: await DeviceInfo.getDeviceId(),
    androidVersion: DeviceInfo.getSystemVersion(),
    notifications: notificationBuffer,
    extractions: extractionBuffer,
    discardedLog: await discardedLogRepository.getAll(),
    dbStats: await getDbStats(),
    mmkvSettings: getRedactedSettings(), // SMTP credentials omitted
    permissions: await getPermissionsStatus(),
    serviceStatus: await NotificationListenerModule.isServiceRunning(),
  };
  
  const path = `${FileSystem.cacheDirectory}taskmind-diagnostics-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));
  await Sharing.shareAsync(path, { mimeType: 'application/json' });
}
```

The export JSON is shared via the Android system share sheet — user can email it to themselves, save to Drive, or attach to a GitHub Issue.

### Usage Pattern for Debugging

When a bug is filed:
1. RJ taps Settings → Diagnostics → Export
2. Attaches the JSON to the GitHub Issue
3. Kiro reads the JSON and can diagnose: which notification arrived, what the extraction decided, what matched, what was discarded, and the full system state at that moment
4. No CI rebuild needed for diagnostic information — only for the fix

---

## Approval Checkpoint

This completes the Master Implementation Plan. All 12 sections cover:

- ✅ All open questions resolved (1.1)
- ✅ Project setup confirmed: Expo Dev Build, New Arch, Hermes V1, TypeScript strict (1.2)
- ✅ Module build order with dependency justification (1.3)
- ✅ Full feature sequencing Sprint 0–6 with effort + DoD (1.4)
- ✅ Custom NLS native module designed end-to-end (1.5)
- ✅ Schema migration strategy with test coverage (1.6)
- ✅ Testing strategy per layer with Jest config (1.7)
- ✅ CI pipeline detailed with workflow specs, cache strategy, build times (1.8)
- ✅ Branching strategy with commit conventions and PR rules (1.9)
- ✅ Risk register with top 10 risks and mitigations (1.10)
- ✅ Full dependency inventory with New Arch compatibility audit (1.11)
- ✅ Diagnostics screen designed in full detail (1.12)

**Awaiting your approval to begin Phase 2: Project Scaffold + CI Pipeline.**

Once you confirm, the next action is to open `feature/sprint-0-scaffold` and begin:
1. Initializing the Expo project
2. Configuring `app.json` for New Architecture
3. Running `expo prebuild --platform android`
4. Creating all 3 CI workflow files
5. Scaffolding the full directory structure
6. Setting up Drizzle schema + migrations
7. Creating the Hello TaskMind placeholder screen
8. Pushing and triggering CI to produce the first downloadable APK
