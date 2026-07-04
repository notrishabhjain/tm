package expo.modules.notificationlistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * Foreground service that runs the FULL in-app call pipeline in the background:
 * find the newest call recording, decode to PCM, transcribe via NVIDIA cloud
 * ASR, resolve the caller (call log + contacts), run LLM analysis (summary +
 * topics + tasks), write everything into the app DB as Review items, and post
 * a tappable notification — all without the app being open.
 *
 * Fallback: if LLM analysis or the DB write fails, degrade to the legacy
 * behavior (stash transcript in prefs; the JS screen extracts on app open).
 * The success path never writes pending_transcript_*, which is what keeps the
 * two paths from double-creating tasks.
 */
class CallTranscriptionService : Service() {

    companion object {
        private const val TAG = "CallTranscriptionSvc"
        const val NOTIFICATION_ID = 1002
        const val CHANNEL_ID = "taskmind_call_transcription"
        const val RESULT_CHANNEL_ID = "taskmind_call_results"

        private const val SAMPLE_RATE = 16000
        // Calls shorter than this skip LLM analysis entirely (user choice —
        // token thrift). The record is still stored silently for call memory.
        private const val MIN_ANALYSIS_DURATION_SEC = 60
        private const val MIN_ANALYSIS_TRANSCRIPT_CHARS = 150
        private const val MAX_TRANSCRIPT_CHARS = 8_000
        // Calls are rare and accuracy-critical — use the strongest free-tier
        // model regardless of the (high-volume, latency-sensitive) notification
        // classifier's model choice. Override via the call_ai_model pref.
        private const val DEFAULT_CALL_MODEL = "meta/llama-3.3-70b-instruct"
    }

    private lateinit var notificationManager: NotificationManager
    private var worker: Thread? = null

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(NotificationManager::class.java)
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildProgressNotification())

        if (worker?.isAlive == true) return START_NOT_STICKY

        worker = Thread {
            try {
                runPipeline()
            } catch (e: Exception) {
                Log.w(TAG, "Pipeline failed: ${e.message}")
            } finally {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }.also { it.start() }

        return START_NOT_STICKY
    }

    private fun runPipeline() {
        val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("call_transcription_enabled", false)) return

        val asrKey = prefs.getString("nvidia_api_key", null).orEmpty()
            .ifBlank { DefaultKeys.NVIDIA_ASR }

        // Most recorder apps flush within a few seconds of the call ending.
        // When the static PhoneStateReceiver fires (no pre-delay), a longer retry
        // window covers MIUI / slow-flush recording apps (up to ~30 s).
        // Back-off: 3 s / 6 s / 10 s / 20 s ≈ 39 s total.
        var recording = CallRecordingFinder.findLatestUnprocessed(this)
        if (recording == null) {
            val retryDelaysMs = longArrayOf(3_000, 6_000, 10_000, 20_000)
            for (delayMs in retryDelaysMs) {
                Thread.sleep(delayMs)
                recording = CallRecordingFinder.findLatestUnprocessed(this)
                if (recording != null) break
            }
        }
        if (recording == null) {
            Log.d(TAG, "No new call recording found after retries")
            return
        }

        val pcm = AudioDecoder.decodeToWhisperPcm(recording.absolutePath)
        if (pcm == null || pcm.isEmpty()) {
            Log.w(TAG, "Failed to decode ${recording.absolutePath}")
            CallRecordingFinder.markProcessed(this, recording)
            return
        }
        val durationSec = pcm.size / SAMPLE_RATE

        val result = NvidiaAsrClient.transcribe(asrKey, pcm)
        CallRecordingFinder.markProcessed(this, recording)

        val text = when (result) {
            is NvidiaAsrClient.Result.Success -> result.text
            is NvidiaAsrClient.Result.Error  -> { Log.w(TAG, "NVIDIA ASR failed: ${result.message}"); return }
            NvidiaAsrClient.Result.NoApiKey  -> { Log.w(TAG, "NVIDIA API key missing"); return }
        }

        // Caller resolution with retry + contacts lookup (fixes "Unknown").
        val caller = CallerResolver.resolve(this, recording)
        val callTime = caller.endedAt

        // ── Short call: store silently, no LLM, no notification ─────────────
        if (durationSec < MIN_ANALYSIS_DURATION_SEC ||
            text.trim().length < MIN_ANALYSIS_TRANSCRIPT_CHARS
        ) {
            Log.d(TAG, "Short call (${durationSec}s, ${text.length} chars) — stored without analysis")
            CallRecordStore.insertCallRecordWithTasks(
                this, caller, recording.absolutePath, text, extraction = null, callTimeMs = callTime
            )
            TaskWidgetProvider.triggerUpdate(this)
            return
        }

        // ── LLM analysis ─────────────────────────────────────────────────────
        // LLM key mirrored from MMKV by setAiCredentials; fall back to ASR key
        // (same NVIDIA platform).
        val llmKey = prefs.getString("ai_api_key", null).orEmpty()
            .ifBlank { DefaultKeys.NVIDIA_LLM }
        val model = prefs.getString("call_ai_model", null).orEmpty().ifBlank { DEFAULT_CALL_MODEL }
        val capped = if (text.length > MAX_TRANSCRIPT_CHARS) {
            text.take(MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]"
        } else text

        val llmResult = NvidiaLlmClient.extract(llmKey, model, capped, callTime, caller.label)

        if (llmResult is NvidiaLlmClient.Result.Success) {
            // Verification pass: re-check every candidate task against the
            // transcript; drops hallucinated/duplicate tasks and fixes titles.
            // On verify failure the pass-1 extraction is used as-is.
            val verified = if (llmResult.extraction.tasks.isNotEmpty()) {
                NvidiaLlmClient.verify(llmKey, model, capped, llmResult.extraction, callTime)
            } else llmResult.extraction

            val inserted = CallRecordStore.insertCallRecordWithTasks(
                this, caller, recording.absolutePath, text, verified, callTime
            )
            if (inserted != null) {
                val route = "/call-review/${inserted.callRecordId}"
                // Route survives a dead process; MainActivity also stashes the
                // intent extra on warm starts (belt and suspenders).
                NotificationListenerModule.setPendingNavRoute(this, route)
                NotificationListenerModule.sendCallRecordReady(
                    inserted.callRecordId, caller.label, inserted.taskIds.size
                )
                // Notification is always posted (fallback + heads-up), and when
                // permitted we ALSO open the app directly on the review screen.
                postResultNotification(
                    recordId = inserted.callRecordId,
                    title = "Call with ${caller.label}",
                    text = when (inserted.taskIds.size) {
                        0 -> "No action items — tap for summary"
                        1 -> "1 task found — tap to review"
                        else -> "${inserted.taskIds.size} tasks found — tap to review"
                    },
                    route = route
                )
                autoOpenApp(route)
                TaskWidgetProvider.triggerUpdate(this)
                return
            }
            // DB write failed → fall through to legacy stash below.
        }

        // ── Fallback: legacy behavior (JS extracts on app open) ─────────────
        Log.w(TAG, "Falling back to prefs stash (LLM or DB failure)")
        prefs.edit()
            .putString("pending_transcript_text", text)
            .putLong("pending_transcript_time", callTime)
            .putString("pending_transcript_caller", caller.label)
            .apply()
        NotificationListenerModule.sendCallTranscriptReady(text, callTime, caller.label)
        postResultNotification(
            recordId = recording.absolutePath,
            title = "Call with ${caller.label}",
            text = "Transcript ready — tap to analyse",
            route = null // resume-check navigation reads the prefs stash
        )
        // Auto-open here too — the resume-check picks up the stashed transcript.
        autoOpenApp(route = null)
        TaskWidgetProvider.triggerUpdate(this)
    }

    /**
     * Opens TaskMind directly on the review screen the moment analysis finishes.
     * Android permits background activity launches when the app holds the
     * SYSTEM_ALERT_WINDOW (display-over-other-apps) permission — which TaskMind
     * already requests for Focus Lock, and FocusLockManager.launchApp proves
     * the pattern works on this device class. Gated on the user-visible
     * "Auto-open after call" toggle (default ON). The result notification is
     * always posted regardless, as the fallback when the launch is blocked.
     */
    private fun autoOpenApp(route: String?) {
        try {
            val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            if (!prefs.getBoolean("call_auto_open", true)) return
            if (!android.provider.Settings.canDrawOverlays(this)) {
                Log.d(TAG, "Auto-open skipped — overlay permission not granted")
                return
            }
            val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            if (route != null) intent.putExtra("taskmind_nav_route", route)
            startActivity(intent)
            Log.d(TAG, "Auto-opened app on ${route ?: "(resume-check)"}")
        } catch (e: Exception) {
            // OEM blocked the background launch — the notification fallback covers it.
            Log.w(TAG, "Auto-open failed: ${e.message}")
        }
    }

    private fun postResultNotification(
        recordId: String,
        title: String,
        text: String,
        route: String?
    ) {
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            if (route != null) launchIntent.putExtra("taskmind_nav_route", route)
            // Unique requestCode per call so successive notifications don't
            // clobber each other's extras.
            val pi = PendingIntent.getActivity(
                this,
                recordId.hashCode(),
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = Notification.Builder(this, RESULT_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pi)
                // Locked phone / screen off: show the review screen on unlock.
                .setFullScreenIntent(pi, true)
                .setAutoCancel(true)
                .build()
            notificationManager.notify(recordId.hashCode(), notification)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to post result notification: ${e.message}")
        }
    }

    private fun buildProgressNotification(): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("TaskMind")
            .setContentText("Analysing your last call…")
            .setOngoing(true)
            .setShowWhen(false)
            .build()
    }

    private fun createNotificationChannels() {
        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Call Transcription",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shown briefly while a call is being transcribed."
                setShowBadge(false)
            }
        )
        notificationManager.createNotificationChannel(
            NotificationChannel(
                RESULT_CHANNEL_ID,
                "Call task review",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Tasks and summary extracted from your calls."
            }
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
