# TaskMind — Complete Build Specification

> Hand this whole document to an AI assistant as the source of truth. It assumes no prior
> context. It is written from a real prior implementation, so the "known failure modes"
> section describes bugs that actually happened, not hypotheticals — treat those as hard
> requirements, because every one of them cost days.

---

## 1. What TaskMind is

An Android app that captures work commitments automatically and turns them into tasks,
without the user ever typing one.

It watches two sources:

1. **Messaging notifications** (WhatsApp, SMS, and similar) — "beta woh 25000 ka payment
   kal tak kar dena" becomes a task due tomorrow.
2. **Phone call recordings** written by the device's own dialer — the audio is transcribed,
   and commitments spoken during the call become tasks.

Both feed a **full-featured task manager inside the app**. The task list is the product.
Anything the app cannot show the user in that list does not exist as far as they are
concerned.

The user is an Indian professional. Conversations are in **Hindi, English, and Hinglish**
(Hindi written in Latin script, freely code-switched). This is not an edge case — it is the
normal input, and any component that assumes English will fail in production.

---

## 2. Target device and environment

| | |
|---|---|
| Device | Redmi Turbo 5, 8 GB RAM |
| OS | Xiaomi HyperOS (India), Android 15 |
| Build target | `compileSdk 35`, `targetSdk 35`, `minSdk 29`, ARM64 only |
| Distribution | Direct install (sideload), **not** Play Store |
| Locale | India; Hindi + English + Hinglish |

Distribution matters: the app needs `MANAGE_EXTERNAL_STORAGE` and notification access, which
together make Play Store approval unrealistic. Assume sideloading, which means **the app must
update itself** (check a manifest, prompt to install) since no store will.

---

## 3. Non-negotiable principles

These are ordered. When they conflict, the earlier one wins.

1. **Never silently lose a capture.** Every failure path must leave the input recoverable and
   retried later. A dropped commitment is the one unforgivable bug.
2. **Precision beats recall.** A wrong task costs the user's attention and their trust in the
   whole list. A missed task costs one commitment. When uncertain, ask rather than assert.
3. **Never fabricate.** No task may exist that was not literally stated in the source text.
   See §8 for how this is enforced.
4. **Silent by default.** Background work produces no notifications. The user gets a
   notification only when a task is created, or when they must act. An app that buzzes
   constantly gets uninstalled — this happened.
5. **Everything is visible.** Every capture attempt and its outcome is written to an activity
   log the user can read. When something does not work, the log must say why.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ CAPTURE (native Android, must survive process death)        │
│  • NotificationListenerService  → message text              │
│  • Call-end triggers ×3         → recording file path       │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ TRANSCRIBE (calls only)                                     │
│  local Whisper  →  free cloud ASR  →  park & retry          │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ EXTRACT — the single most quality-critical stage            │
│  pre-filter → LLM (local or API) → verify pass              │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ INTAKE — ONE funnel. All sources go through it.             │
│  validate → normalise → confidence gate → dedup → persist   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
              TASK LIST  +  REVIEW INBOX (uncertain items)
```

**The intake funnel is the most important architectural rule.** Every source — notifications,
calls, manual entry, accepted review items — must go through one function. In the prior
implementation, the call path bypassed it and wrote to a different table; the result was that
calls were processed correctly for weeks and produced *zero visible tasks*, and nobody noticed
because each path looked fine in isolation. **One funnel. No exceptions.**

---

## 5. Notification capture

Use `NotificationListenerService`. Requires the user to grant notification access in system
settings (it is not a runtime permission).

**Extract per notification:** package name, sender/title, body text, expanded text,
conversation thread if present, group-chat flag, post time, notification key.

**Critical detail — which text to fingerprint.** Android bundles unread messages: the
"expanded text" field accumulates *all* unread messages in a conversation and changes every
time a new one arrives. Deduplicating on it creates a fresh task per bundled message. **Use
the single latest message text for both the fingerprint and the model input**, and fall back
to expanded text only when it is empty.

**Deduplicate** on `hash(package + sender + message text)`, persisted for 7 days. Android
re-delivers notifications freely.

**Reject before any inference** (cheap, deterministic, saves battery and money):
- Own-package and system notifications
- Group-summary, ongoing, and media-control notifications
- OTPs and verification codes
- Bank/payment/delivery/order notices
- Promotions, offers, social-media activity
- Empty or whitespace-only content
- Conversations the user has excluded

Aim this filter at **high recall of real tasks** — reject only on a matched rule, never on
general uncertainty.

**Durability:** if no JS/app context is alive to process a notification, persist it to a
bounded queue (50 entries, oldest dropped) and replay when a context becomes available.
Re-scan active notifications whenever the listener reconnects.

---

## 6. Call capture

### 6.1 The app must not record calls

Android does not permit third-party call-audio capture. The app **consumes recordings written
by the device's own dialer**. If the user has not enabled call recording in their phone app,
call capture cannot work — detect this and say so plainly rather than failing silently.

### 6.2 Detecting that a call ended — use three independent triggers

On Xiaomi/MIUI/HyperOS, any single mechanism can be silently blocked. Implement all three:

| Trigger | Mechanism | Fails when |
|---|---|---|
| Call-log observer | `ContentObserver` on `CallLog.Calls.CONTENT_URI`, registered **inside the notification listener process** | `READ_CALL_LOG` not granted |
| Telephony callback | `TelephonyCallback` in a foreground service | The service is killed |
| Static receiver | `PHONE_STATE` broadcast receiver | MIUI **Autostart** is off |

Plus two recovery paths: a sweep triggered by incoming notification traffic, and a periodic
`AlarmManager` watchdog (~15 min in Doze).

**Why the listener process matters:** a `NotificationListenerService` is system-bound, and is
therefore the *only* context that can reliably start a foreground service from the background
on HyperOS. Host the observer and the recovery sweep there.

Process only completed incoming/outgoing calls with non-zero duration. Ignore missed and
rejected calls.

### 6.3 Finding the recording file

Requires `MANAGE_EXTERNAL_STORAGE` (All Files Access), granted from a system settings screen.
Detect denial explicitly — discovery fails silently without it.

Search, in order: a user-nominated directory, a known-paths list (each scanned one
subdirectory deep), then a MediaStore query filtered on path keywords
(`call`, `record`, `phone`, `voice`, `dialer`, `rec`).

Known paths (Xiaomi first, since that is the target device):

```
/storage/emulated/0/MIUI/sound_recorder/call_rec
/storage/emulated/0/MIUI/sounds/Call
/storage/emulated/0/Recordings/Call recordings
/storage/emulated/0/Recordings/Call Recording
/storage/emulated/0/Sound Recorder
/storage/emulated/0/Music/Recordings/Call Recordings
/storage/emulated/0/Record/PhoneRecord
/storage/emulated/0/Record/Call
/storage/emulated/0/Recordings/Record/Call
/storage/emulated/0/Recordings/Call
/storage/emulated/0/Recordings/CallRecordings
/storage/emulated/0/Documents/Call Recordings
/storage/emulated/0/Recorder/CallRecord
/storage/emulated/0/CallRecording
/storage/emulated/0/PhoneCallRecordings
/storage/emulated/0/Sounds
```

Audio extensions: `m4a`, `amr`, `3gp`, `mp3`, `wav`, `aac`, `opus`, `ogg`.

**Timing — this bites.** The recorder is still flushing the file when the call-end trigger
fires. Retry discovery on an escalating schedule (3 s, 6 s, 10 s, 20 s), and if still nothing,
keep a "call pending" marker alive for ~5 minutes so later sweeps retry. Do **not** give up on
the first miss.

**Mark a recording processed only after its result is persisted.** Marking first means a
transient failure erases the recording from the search path permanently and the call is lost.

### 6.4 On Xiaomi specifically — the HyperAI transcript

The HyperOS Recorder can transcribe a call with Xiaomi's cloud AI, and its Hindi quality is
good. **It cannot be automated.** The flow is: open Recorder → tap the recording → *Show text*
→ pick Hindi → wait → ⋮ → *Copy*. It is user-initiated by design, offers no share action, no
export, and no documented readable transcript file.

Design accordingly:
- **Do not** make this the primary path. It cannot be hands-off.
- **Do** offer a manual import: read the clipboard when the import screen opens, parse it,
  create tasks. Its format is speaker-diarised:
  ```
  Speaker 1 00:00:00
  हाँ जी।
  Speaker 2 00:00:03
  दिल्ली रोड पे हूँ मंडी पे ठीक।
  ```
  Strip the timestamps (noise for extraction), **keep the speaker labels** — "send me the
  report" means something different depending on who said it. Merge consecutive turns by the
  same speaker. Careful: a line like `5:30 baje milte hain` is *speech*, not a timestamp —
  only treat a time as markup when it is alone on its line.

---

## 7. Transcription strategy

Order of preference:

1. **Local Whisper** (see §9) — private, free, offline, no rate limits. Preferred once
   installed.
2. **Free cloud ASR** — fall back when no local model is installed or it fails.
3. **Park and retry** — if neither is available, store the call with the recording path and
   a "awaiting transcription" state, and retry later. Never discard the call.

**Free/cheap ASR options:** Groq (Whisper Large v3, generous free tier, fast), NVIDIA
`build.nvidia.com` (Whisper), OpenRouter (aggregates providers). For Hindi specifically,
**Sarvam AI** (`api.sarvam.ai`, model `saarika:v2.5`) is purpose-built for Indian languages
and Hinglish code-switching and is materially better than Whisper on Hindi phone audio — worth
supporting as a user-configurable key.

**Practical notes:**
- Decode to 16 kHz mono PCM before sending to any ASR.
- Sync ASR endpoints often cap at ~30 s. Chunk longer audio, cutting at the **quietest sample**
  near each boundary so words are not sliced.
- Process long recordings in segments with checkpointing, so a killed process resumes rather
  than restarting.
- Free tiers frequently reserve the right to train on submitted data. If privacy matters, that
  is an argument for the local model, not for any particular cloud vendor.

---

## 8. Task extraction — prompts and grounding

This is where quality is won or lost. The requirement is **zero hallucination**: no task may
exist that was not literally stated.

### 8.1 Enforcement mechanisms

Use all six together; no single one is sufficient.

1. **Reasoning first.** The model states what it found before extracting. Forces it to commit
   to evidence before inventing structure.
2. **Mandatory verbatim evidence.** Every task must carry an `evidence` field containing the
   exact source words that justify it. A task whose evidence string is not found in the source
   is **dropped in code, not by the model**. This is the single strongest anti-hallucination
   device available — the model cannot invent a task without also inventing a quote, and the
   quote is mechanically checkable.
3. **Constrained JSON output.** Use the provider's structured-output / JSON mode, or grammar
   constrained decoding locally. Anything failing schema validation is discarded, never parsed
   leniently.
4. **Empty output is a valid, expected answer.** Say so explicitly. Most messages are not tasks.
5. **Negative worked examples.** Include cases that look like tasks but are not.
6. **A second verify pass.** A separate call reviews each candidate against the source with
   instructions to be strict and drop when in doubt.

### 8.2 Notification extraction prompt

```
You decide whether ONE incoming message creates a task for the user of a personal task
manager. Your verdict is final and goes straight onto their list, so a wrong task costs
them more than a missed one.

Messages are in Hindi, English, or Hinglish (Hindi in Latin script). Read them as a native
speaker of Indian English would.

THREE TESTS — all must pass for isTask=true:
1. A specific person is asking or expecting THE USER to do something, or the user has
   committed to do something. Automated senders, systems and broadcasts never assign tasks.
2. The action is concrete: a verb and an object, something tickable.
   "Send the invoice" passes. "We should catch up sometime" does not.
3. The user could reasonably be the one to act. In a group chat where the request names a
   specific OTHER person as the doer, return false. If the group request is ambiguous about
   who should act, return true and note that it needs verifying.

NEVER a task, regardless of wording: OTPs and verification codes, payment or bank
confirmations, delivery and order status, promotions and offers, news, social-media
activity, app or system alerts.

You are given the current date and time. Resolve every relative expression against it —
"kal", "parso", "aaj shaam", "tomorrow", "by Friday", "5 baje". "kal" meaning a deadline is
tomorrow. If a date is given with no time, use 18:00.

GROUNDING — the strictest rule here:
- The "evidence" field must quote the source message EXACTLY, word for word. Do not
  paraphrase, translate, or tidy it. It will be checked against the original by software and
  the task discarded if it does not match.
- If you cannot supply exact evidence, the task does not exist. Return isTask=false.
- Never infer unstated details. No invented amounts, names, dates or recipients.

Respond with ONLY this JSON, no markdown:
{
  "reasoning": "<1-2 sentences: who wants what from whom, and which tests pass or fail>",
  "isTask": true|false,
  "evidence": "<exact quote from the message, or null if isTask is false>",
  "title": "<imperative, <=60 chars, naming the concrete specifics, in English; null if not a task>",
  "priority": "URGENT|HIGH|MEDIUM|LOW",
  "dueDate": "<ISO 8601 date-time, or null if none stated>",
  "notes": "<amounts, references, context worth keeping; null if none>",
  "confidence": <0.0-1.0, how certain you are this is a real task for this user>
}

Priority: URGENT = explicit urgency or a deadline within ~24h (urgent/ASAP/abhi/aaj/turant).
HIGH = deadline 1-3 days, or clearly important (kal tak/by tomorrow). MEDIUM = a real task
with no stated urgency. LOW = optional (jab time mile).

EXAMPLES

[Mon 7 July, 2:00 PM] WhatsApp from "Sharma Ji": "beta woh 25000 ka payment kal tak kar dena warna late fee lagegi"
{"reasoning":"Sharma Ji directly asks the user to pay 25000 by tomorrow. Personal, concrete, aimed at the user. All three pass.","isTask":true,"evidence":"woh 25000 ka payment kal tak kar dena","title":"Pay ₹25,000 to Sharma Ji","priority":"HIGH","dueDate":"<tomorrow>T18:00:00","notes":"Late fee applies if missed","confidence":0.95}

[Mon 7 July, 2:00 PM] WhatsApp group "College Friends" from "Amit": "bhai Rohit tu hi book kar le tickets, tera card pe offer hai"
{"reasoning":"Amit names Rohit as the one to book. Test 3 fails — a specific other person is the doer.","isTask":false,"evidence":null,"title":null,"priority":"LOW","dueDate":null,"notes":null,"confidence":0.9}

[Mon 7 July, 2:00 PM] SMS from "HDFCBK": "Rs.4,500 debited from a/c XX1234 for UPI txn. Avl bal: Rs.52,310"
{"reasoning":"Automated bank confirmation. No person, no request. Test 1 fails.","isTask":false,"evidence":null,"title":null,"priority":"LOW","dueDate":null,"notes":null,"confidence":0.99}

[Mon 7 July, 2:00 PM] WhatsApp from "Priya": "haan sab theek! chalo phir baat karte hain, bye"
{"reasoning":"Small talk closing a chat. No action requested or committed. Test 2 fails.","isTask":false,"evidence":null,"title":null,"priority":"LOW","dueDate":null,"notes":null,"confidence":0.97}
```

### 8.3 Call transcript extraction prompt

```
You extract commitments from a phone-call transcript for a personal task manager used by an
Indian professional. The transcript may be Hindi, English or Hinglish and WILL contain
speech-recognition errors — read for intended meaning, but never invent content.

You are given the date and time the call took place. Resolve every relative expression
against THAT date, not today.

The transcript may label speakers. Use those labels to decide WHO committed to what. A task
belongs to the user only if the user is the one who must act.

PRECISION RULES — accuracy matters far more than completeness:
- Extract only commitments that were ACTUALLY SPOKEN. Never infer, embellish or complete a
  half-finished thought.
- If a section is garbled, skip it. A garbled section is not a licence to guess.
- Merge near-duplicate commitments into one task.
- Titles must name concrete specifics from the call — names, amounts, documents. Never a bare
  "Follow up".
- Small talk, opinions and general discussion are not tasks. A task needs someone asking for,
  or agreeing to, a specific action.

GROUNDING:
- Every task carries "evidence": the exact transcript words that justify it, copied verbatim.
  Software checks this against the transcript and drops any task whose evidence is not found.
- No evidence means no task.

Return ONLY this JSON, no markdown:
{
  "reasoning": "<list each commitment found, who made it, its deadline; or state there are none>",
  "summary": "<2-3 sentences on what was discussed>",
  "topics": ["<short phrase>", ...],
  "tasks": [
    {
      "title": "<imperative, <=60 chars, quoting specifics>",
      "evidence": "<exact transcript quote>",
      "priority": "URGENT|HIGH|MEDIUM|LOW",
      "dueDate": "<ISO 8601 resolved from the call date, or null>",
      "assignedToMe": <true if the user must act, false if the other party committed>,
      "notes": "<names, amounts, references; null if none>",
      "confidence": <0.0-1.0>
    }
  ]
}

Priority: URGENT = within 24h of the call, or urgent/ASAP/abhi/aaj tak. HIGH = 2-3 days, or
kal tak/important. MEDIUM = no stated urgency. LOW = optional, "jab time mile".

Common Hindi/Hinglish action phrases: "bhej dena", "bhej do", "kar dena", "dekh lena",
"bata dena", "call karna", "confirm karo", "meeting rakhna", "payment karna", "forward karna".

If there are no action items, return "tasks": []. That is a correct and common answer.
```

### 8.4 Verify pass prompt

```
You are a strict reviewer of tasks extracted from a source text. You receive the source and
a list of candidate tasks. For each candidate, judge it against the source:

- "keep"  — clearly stated in the source, and the title and date are accurate
- "fix"   — the commitment is real but the title or dueDate is wrong; supply corrections
- "drop"  — not actually stated, a duplicate, or ordinary conversation misread as a task

Check each candidate's "evidence" against the source. If those words do not appear, the
verdict is "drop" regardless of how plausible the task sounds.

Be strict. When in doubt, drop. A wrong task costs more than a missed one.

Return ONLY JSON:
{"verdicts":[{"index":0,"verdict":"keep|fix|drop","title":<corrected or null>,"dueDate":<corrected or null>,"reason":"<short phrase>"}]}
```

### 8.5 Confidence gating

The model's `confidence` decides what happens, because a small local model is not reliable
enough to write straight to the user's list:

| Confidence | Action |
|---|---|
| ≥ 0.75 | Create the task automatically |
| 0.40 – 0.75 | Send to the **Review Inbox** — one tap to accept or dismiss |
| < 0.40 | Discard, log only |
| missing/invalid | Treat as **uncertain**, never as certain → Review Inbox |

Thresholds must be tunable without an app release.

---

## 9. Local model support (8 GB device)

The user should be able to browse, select and download a model from Hugging Face in-app.

### 9.1 Memory budget

8 GB total RAM means roughly **2–3 GB usable** for a model before Android starts killing the
app. Plan for Q4 quantisation.

| Role | Recommendation | Size (Q4/Q5) | Notes |
|---|---|---|---|
| Task extraction | Qwen 2.5 3B Instruct | ~2.0 GB | Good multilingual/Hindi, **Apache-2.0 at several sizes, ungated** |
| Task extraction (lighter) | Qwen 2.5 1.5B Instruct | ~1.0 GB | Faster, weaker on nuance |
| Task extraction (alt) | Llama 3.2 3B Instruct | ~2.0 GB | Community licence, MAU threshold irrelevant here |
| Task extraction (alt) | Gemma 3 4B | ~2.5 GB | Strong, but **gated** — see below |
| Speech | Whisper small (GGUF) | ~350–500 MB | Usable Hindi |
| Speech (better) | Whisper medium (GGUF) | ~1.5 GB | Noticeably better Hindi, slower |

**Gating is a real obstacle.** Gemma and Llama repos on Hugging Face require accepting a
licence and downloading with an access token. Qwen and the Whisper GGUF conversions are
generally ungated and download with a plain HTTPS GET. **Default to ungated models**, and if
you support gated ones, provide a field for the user's HF token.

### 9.2 Runtimes

- **LLM:** `llama.cpp` via its React Native binding (`llama.rn`) — GGUF format, widest model
  support, supports **GBNF grammars** for constrained JSON output, and prompt caching so the
  long system prompt is not reprocessed per message. Alternative: Google's MediaPipe LLM
  Inference API.
- **ASR:** `whisper.cpp` via `whisper.rn`.

### 9.3 Model manager requirements

- Assess device RAM, free storage and ABI; offer only tiers the device can run.
- Download over Wi-Fi by default, **resumable** (HTTP range requests), with visible size and
  progress before the user commits.
- **Verify a checksum before use.** A truncated download that loads anyway produces garbage
  output that looks like a model quality problem and wastes days.
- Store in app-private storage, excluded from backup.
- Atomic activation: never load a partially downloaded file.
- Updating must not delete the working model until the replacement is verified.
- Show name, version, size and disk usage; allow delete and switch.
- The app must be fully usable **before** any model is downloaded — capture and manual tasks
  work, extraction is marked unavailable.

### 9.4 Inference discipline

- **One inference at a time**, device-wide within the app. Queue the rest.
- Cache the static prompt prefix; reprocessing a 1,500-token system prompt per message is the
  single biggest avoidable cost.
- Cap generation length and wall-clock time; abandon and requeue on overrun.
- Load weights lazily, release under memory pressure.
- Yield when the device reports thermal throttling; resume when it clears.

---

## 10. Task manager feature set

The task list is the product. It must stand on its own against a paid app.

**Core**
- Create, edit, delete, complete, reopen
- Priority: Urgent / High / Medium / Low, with visual weight
- Due date **and time**, plus "no date"
- Notes / description
- Archive (distinct from delete — archived tasks leave the list but are recoverable)
- Sub-tasks / checklist items
- Tags or projects, with filtering

**Views**
- Today / Upcoming / Overdue / Completed / Archived / All
- Sort by due date, priority, or creation
- Search across title and notes
- Grouping by project or date

**Behaviour**
- Recurring tasks (daily / weekly / monthly / custom)
- Reminders and notifications at a chosen time before due
- Snooze / postpone
- Bulk actions (multi-select complete, delete, move, re-prioritise)
- Drag to reorder within a view
- Swipe gestures: complete, archive
- Undo for every destructive action

**Provenance — the differentiator**
- Every auto-created task shows where it came from: contact, app or call, timestamp
- Tap through to the originating message text or transcript excerpt
- Show which engine produced it (local model / cloud / manual)
- **Review Inbox** for uncertain extractions, with the source text visible and one-tap
  accept/dismiss

**Data**
- Export (JSON and CSV) and import
- Local backup and restore
- "Erase all captured content" that clears messages, transcripts and logs but keeps tasks
- Optional Google Tasks two-way sync — **off by default**, and the app must be fully
  functional without it

**Polish**
- Dark and light themes
- Home-screen widget for today's tasks
- Empty states for every filter (a list with no empty state ships as a blank rectangle)
- Full accessibility: screen-reader labels, 4.5:1 contrast, 200% font scaling
- Devanagari and Latin scripts render correctly everywhere

---

## 11. Data model

**Task** — the primary object.
```
id, title, titleKey (normalised, for dedup), notes, dueAt, priority, status
(ACTIVE|COMPLETED|ARCHIVED|DELETED), projectId, tags[], recurrenceRule, reminderAt,
parentTaskId (sub-tasks), sortOrder,
sourceType (NOTIFICATION|CALL|MANUAL|REVIEW), sourceRef, sourceLabel, sourceApp,
evidence (the verbatim quote that justified it), confidence, inferenceOrigin, modelId,
remoteId, syncState, completedAt, createdAt, updatedAt
```

**Enforce dedup in the database**, with a unique index on
`(sourceType, sourceRef, titleKey)` — not by trusting callers to check first. `titleKey` is
the title lowercased with punctuation and politeness prefixes ("please", "kindly", "pls",
"zara", "thoda") stripped, so re-deliveries and rephrasings collapse. A NULL `sourceRef`
exempts manual tasks, which may legitimately repeat.

**Supporting entities:** `ReviewItem` (proposed task + source text + reasoning + confidence +
state), `CallRecord` (caller, number, time, duration, transcript, status, recording path),
`ConversationMessage` (rolling history for context, 7 days), `Fingerprint` (dedup ledger,
7 days), `ActivityLog` (diagnostic trail, newest 300), `ModelRegistry`, `Project`, `Tag`.

**Retention:** transcripts user-configurable (7/30/90 days, default 30). Purging a transcript
must not delete tasks derived from it — that is why `sourceLabel` and `evidence` are
denormalised onto the task.

---

## 12. Background reliability — the hard part

More effort will go here than into features. On HyperOS this is most of the work.

### Android 15 foreground-service rules
- `dataSync` foreground services have a **cumulative ~6 h/day budget**. Exceed it and the
  system throws `ForegroundServiceDidNotStopInTimeException` and **kills the app**.
- Implement **both** `onTimeout(startId)` (API 34) and `onTimeout(startId, fgsType)` (API 35).
  Android 15 calls the two-arg form for `dataSync`; implementing only the one-arg version
  means the handler never fires and the app crashes. *This happened.*
- Release foreground state the moment work completes, not on a fixed timer.
- Use `specialUse` (exempt from the budget) for the always-on residency service; `dataSync`
  only for bounded work.
- Local inference is far slower than an API call, so it consumes this budget much faster.
  Track cumulative usage and defer non-urgent work when the reserve runs low. Prefer running
  heavy work when charging and idle.

### MIUI / HyperOS
- **Autostart** is a separate Xiaomi permission. With it off, static broadcast receivers never
  fire and background services get killed regardless of Android battery settings. Detect the
  manufacturer and walk the user to that specific screen during setup.
- Battery optimisation must be disabled for the app.
- Background service starts are blocked from ordinary contexts. Components hosted in the
  system-bound notification listener are the reliable path.

### General
- A watchdog alarm (`setAndAllowWhileIdle`, ~15 min in Doze) that restarts dead components and
  **reschedules itself first**, so a crash in its body cannot break the chain.
- Restart everything on `BOOT_COMPLETED`.
- The listener binding dies periodically; call `requestRebind` on disconnect.
- Every background entry point needs a top-level catch. A crash kills the notification
  listener with it.
- Checkpoint long work so a killed process resumes rather than restarting.

### Permissions
`BIND_NOTIFICATION_LISTENER_SERVICE` (special), `MANAGE_EXTERNAL_STORAGE` (special),
`READ_CALL_LOG`, `READ_PHONE_STATE`, `READ_CONTACTS`, `POST_NOTIFICATIONS` (runtime),
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `FOREGROUND_SERVICE_SPECIAL_USE`,
`RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `INTERNET` (normal).

Re-check permissions on every app start and watchdog cycle — revocation must show up on the
status screen within one cycle, not silently disable a feature.

---

## 13. Known failure modes — design against these from day one

Every one of these actually happened in the prior implementation.

1. **Tasks written to the wrong table.** The call path wrote extracted tasks to a sync outbox
   instead of the task table. With sync disabled, they sat there forever. Calls were processed
   correctly and produced zero visible tasks for weeks. → **One intake funnel, always.**

2. **`onTimeout` signature mismatch.** Only the one-arg overload was implemented, so Android 15
   never called it and killed the app on the dataSync budget. The crash killed the notification
   listener, which killed call detection. → **Implement both overloads.**

3. **Notification spam.** Two background services posted a progress notification on every
   invocation while being started on short timers. The app buzzed every few minutes all day.
   → **Silent by default; mark service notifications `FOREGROUND_SERVICE_DEFERRED` so short
   runs never draw; never start a service on a timer just to poll.**

4. **`NULL` excluded by a numeric filter.** A query filtered `duration >= 15`, which is *false*
   for NULL in SQL. Every call with unknown duration was silently skipped and never extracted.
   → **Handle NULL explicitly in every numeric filter.**

5. **Marked processed before persisting.** A recording was flagged handled before its result
   was stored; a transient failure then erased it from the search path permanently.
   → **Persist first, mark second.**

6. **Corruption recovery deleted user data.** The DB reset path was written when tasks lived in
   the cloud and the local file was disposable. Once tasks became local, that code silently
   destroyed them. → **Salvage user data before any destructive recovery, and revisit such
   assumptions whenever the data model changes.**

7. **Racy pre-check defeated a retry loop.** A sweep checked "is there a recording?" before
   starting the service that had its own robust retry loop. Right after a call the file is
   still being written, so the check returned nothing and the sweep was skipped.
   → **Do not pre-check what the callee already handles better.**

8. **Diagnostic that did not test the real path.** The built-in self-test exercised only
   discovery and transcription, reported success, and pointed debugging away from the actually
   broken extraction stage for a long time. → **A self-test must run the production path.**

---

## 14. Suggested stack

React Native + Expo (managed prebuild), TypeScript, with native Android modules in Kotlin for
the notification listener, call triggers, foreground services and model runtimes. SQLite
(Drizzle ORM) for structured data; MMKV for settings and tokens (synchronous and shared
across the main and headless JS contexts — important, because background work runs in a
separate JS context with no in-memory state).

Not mandatory — a fully native Kotlin app is a reasonable alternative and avoids the
JS/native bridge entirely. But the capture layer **must** be native either way.

---

## 15. Build order

Do not build features before the pipeline that feeds them works end to end.

1. **Task manager first.** Data model, list, CRUD, priorities, archive, filters. Verifiable
   with manual entry alone, and it is what everything else writes into.
2. **The intake funnel.** Validation, normalisation, confidence gating, dedup. Unit-test it
   hard — it is where correctness lives.
3. **Notification capture → tasks**, using a cloud API for extraction initially. Proves the
   whole chain with the simpler of the two sources.
4. **Call capture → transcription → tasks.** Triggers, discovery, ASR, extraction.
5. **Background reliability hardening.** Watchdog, triggers, OEM setup, foreground-service
   budget. Expect this to take longer than steps 1–4.
6. **Local models.** Model manager, download, llama.cpp and whisper.cpp integration, switch
   extraction to local-first with cloud fallback.
7. **Polish.** Widget, recurring tasks, reminders, export, sync.

**Test on the real device from step 3 onward.** An emulator cannot reproduce MIUI Autostart,
the foreground-service budget, or the dialer's recording behaviour — which is where nearly all
the difficulty lives.

---

## 16. Definition of done

- Make a call, hang up, touch nothing: a task appears within a few minutes, correctly
  attributed to the caller.
- Receive a WhatsApp message containing a request with the app force-stopped: a task appears.
- Airplane mode: calls still transcribe and extract locally; sync catches up on reconnect.
- 24 hours of ordinary use: no notification other than task confirmations.
- 7-day soak: no crash, no unbounded queue growth, attributable battery ≤ 4%/day.
- Every task in the list can be traced to the exact words that created it.
- No task exists that was not said.
