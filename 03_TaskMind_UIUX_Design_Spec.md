# UI/UX Design Specification

## TaskMind — Personal Task Automation App for Android

| Field                | Value                                |
| -------------------- | ------------------------------------ |
| **Document Version** | 2.0                                  |
| **Date**             | May 18, 2026                         |
| **Author**           | RJ                                   |
| **Target Tool**      | Google Stitch                        |
| **Implementation**   | React Native + Expo (Native Android) |

---

## 1. Design Philosophy

### 1.1 Core Design Principles

**1. Confrontation over Comfort**
The app exists to combat procrastination. Visual design must surface pending work prominently — never hide it. No collapsing of urgent items. No comforting "0 / 10 done" celebrations until work is actually complete.

**2. Information Density with Hierarchy**
Power-user app for a single user. Density is acceptable, but hierarchy must be ruthless: priority color, source app, and task text are first-class; everything else is secondary.

**3. Bilingual First**
Hindi (Devanagari) and English text must coexist without typographic awkwardness. No font that renders Devanagari as fallback or as visibly different weight.

**4. Calm Authority**
The app makes serious demands on the user. Visual language is confident, not playful. No mascot, no celebratory animations beyond subtle haptic confirmation.

**5. Zero-Snooze UI**
Nowhere in the interface shall there be a "Later", "Remind Me", "Snooze", or "Postpone" affordance. This is a deliberate omission and a defining design constraint.

**6. Native-Feeling Despite React Native**
Despite the cross-platform framework underneath, the app must feel native to Android. Use Material 3 patterns. Respect Android navigation conventions. No iOS-isms.

### 1.2 Design Tone Keywords

Focused • Intentional • Crisp • Confident • Bilingual-Native • Slightly Industrial

---

## 2. Design System

### 2.1 Color Palette

#### Primary (Brand)

| Token         | Hex     | Usage                              |
| ------------- | ------- | ---------------------------------- |
| `primary-900` | #0A2540 | Headers, top-bar background (dark) |
| `primary-700` | #1E3A5F | Surface accent, active nav (dark)  |
| `primary-500` | #2E5B8E | Primary buttons, links             |
| `primary-300` | #6B8FBF | Disabled states, supporting        |
| `primary-100` | #D5E2F2 | Backgrounds, chip fills            |
| `primary-50`  | #F2F6FB | Page background (light)            |

#### Priority Semantic Colors

These are non-negotiable. Each priority has a fixed color used consistently across all screens.

| Priority   | Color        | Hex     | Light BG | Dark BG |
| ---------- | ------------ | ------- | -------- | ------- |
| **URGENT** | Crimson Red  | #D62828 | #FCE5E5  | #4A1010 |
| **HIGH**   | Amber Orange | #E76F00 | #FDEBD3  | #4A2810 |
| **MEDIUM** | Steel Blue   | #2E5B8E | #D5E2F2  | #1A2F4A |
| **LOW**    | Slate Gray   | #6B7785 | #E8EBEE  | #2A3138 |

#### Neutral / Surface

| Token                | Hex (Light) | Hex (Dark) |
| -------------------- | ----------- | ---------- |
| `surface`            | #FFFFFF     | #121417    |
| `surface-variant`    | #F4F6F8     | #1A1D21    |
| `outline`            | #D6DAE0     | #2E3338    |
| `on-surface`         | #1A1D21     | #ECEEF1    |
| `on-surface-variant` | #4A5159     | #A8B0B9    |

#### Status / Feedback

| Token     | Hex     |
| --------- | ------- |
| `success` | #2E8540 |
| `warning` | #E76F00 |
| `error`   | #D62828 |
| `info`    | #2E5B8E |

### 2.2 Typography

#### Font Family

- **Primary:** Inter (English) — weights 400, 500, 600, 700. Load via `expo-font`.
- **Devanagari:** Noto Sans Devanagari — must match Inter's optical weight.
- **Monospace:** JetBrains Mono — for raw source text in detail view.

#### Type Scale

| Token        | Size (px in RN) | Weight | Line Height | Usage                |
| ------------ | --------------- | ------ | ----------- | -------------------- |
| `display-lg` | 32              | 700    | 40          | Onboarding hero      |
| `display-md` | 24              | 700    | 32          | Screen titles        |
| `headline`   | 20              | 600    | 28          | Section headers      |
| `title-lg`   | 18              | 600    | 24          | Task text (list)     |
| `title-md`   | 16              | 600    | 22          | Card titles          |
| `body-lg`    | 16              | 400    | 24          | Primary body text    |
| `body-md`    | 14              | 400    | 20          | Secondary text       |
| `label-lg`   | 14              | 500    | 20          | Buttons, chips       |
| `label-md`   | 12              | 500    | 16          | Metadata, timestamps |
| `caption`    | 11              | 400    | 14          | Captions, hints      |

**RN Note:** Use `PixelRatio.getFontScale()` to respect user font scaling. Wrap text styles in a helper that applies font scaling automatically.

### 2.3 Spacing System

4px base unit (RN convention, but scales appropriately).

- `xs`: 4
- `sm`: 8
- `md`: 16
- `lg`: 24
- `xl`: 32
- `2xl`: 48
- `3xl`: 64

### 2.4 Corner Radius

- `none`: 0
- `sm`: 4 (chips, small inputs)
- `md`: 8 (buttons, cards in list)
- `lg`: 12 (large cards, sheets)
- `xl`: 16 (modals, hero cards)
- `full`: 9999 (avatars, FAB)

### 2.5 Elevation (Shadows)

RN handles shadows differently per platform. Use these for Android:

- `level-0`: No shadow
- `level-1`: `elevation: 2`
- `level-2`: `elevation: 6`
- `level-3`: `elevation: 12`

### 2.6 Iconography

- **Library:** `lucide-react-native` (preferred) OR `@expo/vector-icons` with Material Icons
- **Weight:** 1.5px stroke
- **Size:** 20 (inline), 24 (standard), 32 (feature)
- **Color:** inherits text color unless semantic

---

## 3. Component Library

All components implemented as functional React components with TypeScript. Use the Expo theme system or a custom ThemeProvider.

### 3.1 Task Card (Primary Component)

The most important component. Used on Home and Confirmation Inbox.

**Layout (left to right):**

- Priority Indicator Bar: 4px wide vertical bar in priority color, full height
- Content area (padded 16):
  - Row 1: Task text (title-lg, on-surface, max 2 lines, ellipsis)
  - Row 2: Source app icon (16) + sender name + " · " + relative time (label-md, on-surface-variant)
  - Row 3 (if needsConfirmation): Yellow info chip "Needs confirmation"
- Right edge: Overflow menu (vertical 3-dot, 48 tap target)

**RN Implementation Notes:**

- Use `react-native-gesture-handler` for swipe gestures.
- Use `react-native-reanimated` for swipe animations (off-JS-thread).
- Use FlashList from `@shopify/flash-list` for the list, not FlatList.
- Stable keys via task.id.

**States:**

- Default
- Pressed (surface-variant background)
- Swiped right (reveals green Complete action)
- Swiped left (reveals red Delete action)
- Long-pressed (multi-select mode)

**Specs:**

- Min height: 72
- Background: surface
- Border: 1 outline (bottom only)
- In Confirmation Inbox: 12 radius, 1 outline all around

### 3.2 Priority Chip

**Variants:**

- Filled (default): background = priority color, text = white, label-md
- Outlined: 1.5 border in priority color, text in priority color

**Specs:**

- Height: 24
- Padding: horizontal 10
- Radius: `sm` (4)
- Text: ALL CAPS

### 3.3 Source App Chip

- Height: 28
- Icon: 16 left, 6 gap, then text
- Background: surface-variant
- Radius: `full`

### 3.4 Primary Button

- Height: 48
- Padding: horizontal 24
- Background: primary-500
- Text: label-lg, white
- Radius: `md`
- Min width: 96
- Disabled: primary-300, 50% opacity
- Pressed state: primary-700

### 3.5 Secondary Button (Outlined)

- Same dimensions
- 1.5 border in primary-500
- Transparent background
- Text in primary-500

### 3.6 Destructive Button

Same as Primary, background = error (#D62828).

### 3.7 Text Input Field

- Height: 56 (single line), auto-grow (multiline up to 4 lines)
- Background: surface-variant
- Border: 1 outline (focused: 2 primary-500)
- Radius: `md`
- Floating label

**RN Notes:** Use `react-hook-form` for form state. Use controlled inputs.

### 3.8 Toggle Switch

Use `Switch` from `react-native`, themed with primary color.

### 3.9 Bottom Sheet

Use `@gorhom/bottom-sheet` library.

- Background: surface
- Top corners: `lg` (12)
- Drag handle: 32 wide × 4 tall, on-surface-variant @ 30%
- Max height: 80% of screen
- Backdrop: rgba(0,0,0,0.4)

### 3.10 Top App Bar

- Height: 64 (+ safe area inset top)
- Background: surface
- Title: title-lg, on-surface
- Left: optional back arrow (24)
- Right: optional action icons (max 2 + overflow)
- No elevation default; 1 bottom border when scrolling

### 3.11 Bottom Navigation Bar

- Height: 80 (with system gesture inset)
- Items: 4 (Home, Confirmations, History, Settings)
- Selected: filled icon + label + primary-500
- Unselected: outlined icon + label + on-surface-variant
- Background: surface
- Top border: 1 outline

**RN Notes:** Use Expo Router's tab navigator OR React Navigation's bottom tabs.

### 3.12 Empty State

- Centered vertically
- Icon: 64, on-surface-variant @ 40%
- Title: title-lg, on-surface
- Description: body-md, on-surface-variant, max 280 wide, center
- Optional action button

### 3.13 Filter Chip Row

- Horizontally scrollable
- Each chip: 32 height, `full` radius
- Selected: primary-100 bg, primary-700 text
- Unselected: surface-variant bg, on-surface text
- Active filter: leading checkmark icon (16)

### 3.14 Confirmation Action Pair

- Two buttons side by side, equal width, 8 gap
- Left: "Yes, Add" (Primary)
- Right: "No, Discard" (Outlined with error color)

### 3.15 Stats Card

- Background: surface
- Padding: 16
- Radius: `md`
- Layout: 2×2 or 4-column grid
- Each: large number (display-md, primary-700) + caption label

---

## 4. Screen Specifications

### 4.1 Onboarding Flow (7 screens)

**Note for Kiro:** Use a stack navigator for onboarding. Each screen is a separate route. Pass progress via params.

#### O-01: Welcome

- Full-bleed primary-900 background
- Centered: TaskMind logo (mark + wordmark, 80 tall)
- "Your tasks. Captured. Confronted." (display-md, white)
- 2-line tagline (body-lg, primary-100)
- Bottom: "Get Started" primary button (full width minus 24 margin), 48 from bottom inset

#### O-02: Concept Explanation

- White bg
- Three icon + title + description blocks stacked, 32 spacing:
  1. ⚡ "Auto-Captures Tasks" — "From WhatsApp, SMS, email, and more"
  2. 🚫 "No Snooze. Ever." — "Designed to break procrastination"
  3. 🔒 "Fully Offline" — "Your data never leaves this device"
- Bottom: "Next" primary button

#### O-03: Notification Access Permission

- Hero illustration (256×256) of phone with notifications flowing
- Title: "Grant Notification Access"
- Description with privacy reassurance
- Primary button: "Open Settings" (deep-links to NLS settings via custom native module)
- Secondary: "Skip for Now"

#### O-04: Select Apps to Monitor

- List of installed messaging apps with checkboxes
- Defaults pre-checked: WhatsApp, SMS, Gmail, Slack, Teams, Telegram
- Search bar to filter
- "Continue" primary button

**RN Notes:** Use `react-native-launch-arguments` or custom native module to enumerate installed apps. Cache the result.

#### O-05: Add VIP Contacts

- Title: "Who matters most?"
- Subtitle: "Messages from these people always create URGENT tasks"
- Input field with "+ Add Contact"
- Chip list of added VIPs (deletable)
- Skip option

#### O-06: Configure Nudges

- Title: "How should we nudge you?"
- Frequency: radio group (15/30/60/120/240/off), default 60
- Quiet hours: start/end time pickers, default 22:00–07:00
- Toggle: "Urgent tasks override quiet hours" (default ON)

#### O-07: Optional Features

- Email Report toggle + configure button
- Download Intelligence Model toggle + button (~50 MB ONNX, warning)
- Both optional, can defer
- "Finish Setup" primary button

### 4.2 Home Screen (Tasks)

**Layout (top to bottom):**

1. **Top App Bar (64)**

   - Left: TaskMind logo mark (24)
   - Center: "Tasks" title (title-lg)
   - Right: Sort icon, overflow menu

2. **Stats Strip (~56)**

   - 4 mini-stats horizontally:
     - Pending: count + "PENDING"
     - Urgent: count in urgent color + "URGENT"
     - Today: tasks created today + "TODAY"
     - Done: completed today + "DONE TODAY"
   - Background: surface-variant
   - Separator below

3. **Filter Chip Row (48)**

   - "All" / priorities / source apps
   - Horizontally scrollable
   - Persistent across sessions

4. **Task List (fill remaining)**

   - FlashList of Task Cards
   - Sorted: priority DESC, then createdAt DESC
   - Sticky section headers for priority groups when "All" active
   - Swipe gestures (Reanimated):
     - Right: Complete (52 wide), commit at 50%
     - Left: Delete with confirm
   - Long-press: multi-select mode

5. **Empty State:**
   - "All clear!"
   - "No pending tasks. Enjoy the moment — or start something new."

**No FAB.** Manual task creation via overflow menu only.

### 4.3 Task Detail Screen

**Layout:**

1. **Top App Bar**

   - Back arrow, Title "Task", Edit/Calendar/overflow

2. **Priority Banner (full-width, 64)**

   - Background: priority color @ 12% alpha
   - Priority Chip + "Created {relative time}" + status

3. **Task Content (padded 24)**

   - Task text, title-lg, selectable, full text

4. **Source Info Card (md radius, surface-variant)**

   - Padded 16, metadata rows:
     - Source: [app icon] WhatsApp
     - Sender: name
     - Received: date · time
     - Language: badge
     - Confidence: 0.87 (progress bar)

5. **Original Message (collapsible)**

   - Header with chevron
   - Body: rawSourceText in JetBrains Mono, surface-variant bg

6. **Matched Keywords Chips**

   - Small chips, color-coded by category

7. **Due Date (if set)**

   - Calendar icon + date + Edit link

8. **Action Bar (sticky bottom)**
   - Complete (success color) | Delete (outlined error) | Calendar (outlined primary)

### 4.4 Confirmation Inbox Screen

**Layout:**

1. Top App Bar: "Pending Confirmations" + badge
2. Info Banner (dismissible): "These messages might be tasks. Review and decide."
3. List of Confirmation Cards:
   - Sender + timestamp header
   - Original message (matched keywords highlighted in primary-100)
   - Extracted task in italics
   - Confidence indicator
   - "Yes, Add" / "No, Discard"
4. Empty state: "Nothing to review"

### 4.5 History Screen

**Layout:**

1. Top App Bar: "History" + filter icon
2. Stats Card (full width):
   - 2×2 grid: Completed in range, Avg time, Top source, Completion rate
3. Filter Chip Row: active filters as removable chips
4. Date Group Headers (sticky)
5. History Task Cards:
   - Strikethrough text
   - Status badge: COMPLETED/DELETED
   - Completion time
   - Tap: read-only detail
   - Long press: restore option
6. Filter Bottom Sheet:
   - Time range, Status, Source app, Priority
   - "Apply" button

### 4.6 Import Transcript Screen

**Layout:**

1. Top App Bar: "Import Transcript" + back
2. Meeting Info:
   - "Meeting name" input
   - "Date" input (defaults today)
3. Transcript Input:
   - Large multiline (min 240 tall)
   - Placeholder: "Paste your transcript here. Hindi, English, or both."
   - Character count
   - "Clear" link
4. Action Bar: "Extract Tasks" primary button
5. After extraction → Review Screen:
   - "{N} potential tasks found"
   - Checkable list with editable text and priority
   - Bulk actions: Select All / Deselect / Set Priority
   - "Save {N} Tasks"

### 4.7 Settings Screen

Sections:

**General**

- Theme: System / Light / Dark
- Language: System / English / हिन्दी

**Detection**

- Monitored Apps → sub-screen
- VIP Contacts → sub-screen
- Confidence Thresholds (advanced, collapsible)

**Nudges**

- Global frequency
- Quiet hours
- Per-priority overrides (collapsible)
- Urgent override toggle
- Sound / vibration

**Intelligence**

- Model status (downloaded / not)
- Model version
- Learned Vocabulary → screen
- Re-download model (advanced)
- Rule vs Model weight (advanced)

**Email Report**

- Enable toggle
- SMTP config → form
- Send time
- Test email button

**Calendar**

- Default calendar
- Default duration (15/30/60)

**Data**

- Export → options sheet
- Import → file picker
- Auto-backup → toggle + folder
- Clear discarded log
- Reset all data

**Diagnostics** (always visible since no debugger)

- View recent notifications
- View extraction decisions
- View discarded log
- Export all diagnostics as JSON

**About**

- Version + commit hash
- Permissions status
- OEM battery whitelist guide
- Open-source licenses

### 4.8 Learned Vocabulary Screen

1. Top App Bar: "Learned Vocabulary"
2. Info Card: "TaskMind has learned {N} phrases"
3. Tab Strip: Active | Pending | Demoted
4. Phrase List:
   - Phrase text
   - Category chip
   - Language badge
   - Frequency
   - "Used in {N} confirmed tasks"
   - Overflow: Demote / Remove / Examples

### 4.9 Email Report Configuration

1. Top App Bar: "Email Report Setup"
2. Form:
   - SMTP host, port (presets: Gmail / Outlook / Custom)
   - Auth: username, password (masked)
   - Use TLS toggle
   - Recipient
   - Send time picker
3. Test Section: "Send Test Email" + result
4. Save button

### 4.10 Diagnostics Screen (Critical for No-Local-Dev)

Since the user has no local debugger, this screen is essential.

1. Top App Bar: "Diagnostics" + Export icon
2. Tabs: Notifications | Extraction | Discarded | DB Stats | System
3. **Notifications tab:** last 50 captured notifications with timestamp, source, text
4. **Extraction tab:** last 50 extraction decisions with matched keywords, scores, decision
5. **Discarded tab:** all discarded items with reasons
6. **DB Stats:** row counts per table, DB size
7. **System:** app version, commit hash, device info, permissions status
8. **Export:** generates JSON file with all data, shared via system share sheet

### 4.11 OEM Battery Guide

1. Detected device: "Xiaomi Redmi Note 12"
2. Step-by-step cards with:
   - Step number badge
   - Screenshot illustration
   - Description text
   - "Open Setting" deep-link button

---

## 5. Notification UI (System Surfaces)

### 5.1 Persistent Status Notification

**Implemented in custom native module, NOT via Notifee** (Notifee cannot create truly non-dismissible notifications).

**Collapsed View:**

- App icon
- Title: "TaskMind"
- Text: "{N} pending • {M} urgent"

**Expanded View:**

- BigTextStyle: top 2 task texts as bullet list
- Actions: "Open" → launches app, "Done Top" → completes highest priority

**Style:**

- Small icon: app icon
- Color accent: primary-500
- No dismissal possible (FLAG_NO_CLEAR + FLAG_ONGOING_EVENT)

### 5.2 Nudge Notification

**Implemented via Notifee scheduled triggers.**

- Heads-up notification
- Title: "Pending: {top task text}"
- Text: "{N} tasks need your attention"
- Actions: "Complete" + "Open"
- Dismissible
- Vibration + sound per settings

### 5.3 Confirmation Heads-Up

- Heads-up notification
- Title: "Possible task from {sender}"
- Text: extracted task text
- Actions: "Yes, Add" / "No, Discard" / "Review"
- Dismissible

---

## 6. Interaction Patterns

### 6.1 Gestures

| Gesture         | Context      | Action                       |
| --------------- | ------------ | ---------------------------- |
| Tap             | Task card    | Open detail                  |
| Long press      | Task card    | Multi-select mode            |
| Swipe right     | Task card    | Reveal Complete (50% commit) |
| Swipe left      | Task card    | Reveal Delete (with confirm) |
| Pull to refresh | Task list    | Re-query DB                  |
| Swipe down      | Bottom sheet | Dismiss                      |

**RN Implementation:** Use `react-native-gesture-handler` + `react-native-reanimated` for all gestures. JS-thread animations are forbidden.

### 6.2 Animations & Motion

- Duration: 100ms (instant feedback), 200ms (standard), 300ms (emphatic)
- Easing: Material 3 standard curves (via Reanimated's `Easing`)
- Task complete: slide right + fade + green pulse on notification
- Task delete: slide left + fade + red flash
- New task arrival: subtle slide-down + haptic
- Screen transitions: native-feeling, React Navigation defaults

**Never use the JS-thread animation driver.** All animations via Reanimated worklets.

### 6.3 Haptic Feedback

Use `expo-haptics` or `react-native-haptic-feedback`.

| Event                   | Haptic               |
| ----------------------- | -------------------- |
| Task complete           | Success (medium)     |
| Task delete             | Warning (double tap) |
| Swipe threshold crossed | Light selection      |
| URGENT nudge fires      | Heavy impact         |
| Filter applied          | Light selection      |

### 6.4 Loading States

- Initial load: skeleton task cards (3 placeholder, shimmer via Reanimated)
- Action processing: inline progress on button
- Transcript extraction: progress bar + "Extracting..."
- Model download: linear progress with size/speed

### 6.5 Error States

- Inline errors: below field, error color, 12sp
- Dialogs: destructive failures only
- Snackbar: transient feedback (use `react-native-paper`'s Snackbar or custom)
- Empty error state: retry button

---

## 7. Accessibility Requirements

| ID      | Requirement                                                            |
| ------- | ---------------------------------------------------------------------- |
| A11Y-01 | All interactive elements ≥48 touch target                              |
| A11Y-02 | Color contrast ≥4.5:1 body, ≥3:1 large (WCAG AA)                       |
| A11Y-03 | All icons have `accessibilityLabel`                                    |
| A11Y-04 | Semantic order matches visual order                                    |
| A11Y-05 | TalkBack announces priority + source for every task card               |
| A11Y-06 | Font scaling 100%–200% without breakage                                |
| A11Y-07 | No info via color alone (priority has icon + text too)                 |
| A11Y-08 | Focus indicators for D-pad                                             |
| A11Y-09 | Reduced motion respected (`AccessibilityInfo.isReduceMotionEnabled()`) |

---

## 8. Dark Mode Specification

All screens support dark mode via theme tokens.

| Surface              | Light   | Dark    |
| -------------------- | ------- | ------- |
| Background           | #F2F6FB | #0E1116 |
| Card                 | #FFFFFF | #1A1D21 |
| Top app bar          | #FFFFFF | #1A1D21 |
| Priority bg (urgent) | #FCE5E5 | #4A1010 |
| Outline              | #D6DAE0 | #2E3338 |

**Priority colors stay vibrant in both modes** — never desaturate.

**RN Implementation:** Use `Appearance.getColorScheme()` + `useColorScheme()` hook. Store user override in settings.

---

## 9. Responsive Behavior

- **Phone portrait (primary):** Default design.
- **Phone landscape:** Tasks list → 2-column above 600 width. Detail → master-detail.
- **Tablet:** Master-detail (40/60).
- **Foldables:** WindowSizeClass via `useWindowDimensions`.

---

## 10. Asset Requirements

### 10.1 App Icon

- Adaptive icon: foreground vector + primary-900 background
- Concept: stylized checkmark with diagonal slash ("done, no snooze")
- Format: PNG, 1024×1024 source. Expo auto-generates densities.

### 10.2 Onboarding Illustrations

- 4 custom illustrations
- Style: geometric, flat, 2-color (primary + accent)
- Format: SVG via `react-native-svg`

### 10.3 Empty State Illustrations

- "All Clear" — empty inbox
- "Nothing to Review" — checkmark with pause
- "No History" — empty calendar
- Same style as onboarding

### 10.4 Stitch Prompt Template

When prompting Google Stitch:

> "Generate a [SCREEN NAME] for a native Android task management app called TaskMind. The app combats procrastination by auto-converting notifications into tasks. Use Material 3 design language. Color scheme: deep navy primary (#0A2540), with priority colors crimson red (#D62828) for URGENT, amber orange (#E76F00) for HIGH, steel blue (#2E5B8E) for MEDIUM, slate gray (#6B7785) for LOW. Typography: Inter for English, Noto Sans Devanagari for Hindi. Tone: confident, intentional, slightly industrial — NOT playful. The app shows both English and Hindi text natively. No snooze, defer, or 'remind me later' affordances anywhere. [SCREEN-SPECIFIC DETAILS]. Use realistic content including tasks like 'kal tak report bhej dena please', 'Submit GHCI UAT closure document', 'Call vendor about pricing — Ravi WhatsApp 11:32 AM'. App will be built in React Native, so designs should be implementable with Material 3 patterns and React Native components."

---

## 11. Sample Content for Mockups

### 11.1 Sample Task Texts

**URGENT (English):**

- "Submit GHCI UAT closure document by EOD"
- "Call vendor about pricing — payment due tomorrow"
- "Review and approve sprint backlog before standup"

**URGENT (Hinglish):**

- "Ravi sir ko abhi report bhej do"
- "Client meeting ke liye agenda turant tayyar karo"

**HIGH (English):**

- "Reply to NeGD team about Phase 2 roadmap deck"
- "Update certificate versioning specification document"

**HIGH (Hindi):**

- "कल तक UAT टेस्ट केस वर्कबुक भेजना है"

**MEDIUM (Hinglish):**

- "Sprint review ki slides finalize karna hai"
- "Designer ko Figma file share kar do"

**LOW (English):**

- "Read the article Mira shared on AI governance"
- "Check Slack thread on new design tokens"

### 11.2 Sample Senders

Ravi Sharma · NeGD Team · Priya · Anand sir · Design Group · Client Lead · Mira · Sprint Channel

### 11.3 Sample Source Apps

WhatsApp · Gmail · SMS · Slack · Microsoft Teams · Telegram · Meeting Transcript

---

## 12. Design Handoff Checklist

When Stitch outputs arrive, verify:

- [ ] All priority colors match exact hex values
- [ ] Devanagari renders correctly with proper font
- [ ] No snooze/defer/later affordance anywhere
- [ ] Persistent notification mockup shows non-dismissibility
- [ ] Empty states have appropriate copy and illustration
- [ ] Dark mode variants for all screens
- [ ] Accessibility (touch targets, contrast) verified
- [ ] Task cards show source app + sender + time
- [ ] Confirmation flow distinguishes "needs confirmation" visually
- [ ] Settings organized into clear sections
- [ ] Diagnostics screen designed (critical for no-local-dev)

---

## 13. Out of Scope for Stitch

- App icon launcher variants (handled separately)
- Splash screen animation
- Pixel-perfect notification shade renderings (use Material 3 standards)
- Marketing screenshots
