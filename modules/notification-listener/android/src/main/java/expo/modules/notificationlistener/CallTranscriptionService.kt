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
import com.facebook.react.HeadlessJsTaskService

/**
 * v2 call pipeline, fully in the background:
 * recording → Whisper ASR → caller resolution → 70B LLM extraction + verify
 * pass → tasks into the outbox → headless JS flush pushes them to Google Tasks
 * → one confirmation notification. No screens involved.
 */
class CallTranscriptionService : Service() {

    companion object {
        private const val TAG = "CallTranscriptionSvc"
        const val NOTIFICATION_ID = 1002
        const val CHANNEL_ID = "taskmind_call_transcription"
        const val RESULT_CHANNEL_ID = "taskmind_call_results"

        private const val SAMPLE_RATE = 16000
        // Calls shorter than this skip LLM analysis entirely (token thrift).
        private const val MIN_ANALYSIS_DURATION_SEC = 60
        private const val MIN_ANALYSIS_TRANSCRIPT_CHARS = 150
        private const val MAX_TRANSCRIPT_CHARS = 8_000
        private const val DEFAULT_CALL_MODEL = "meta/llama-3.3-70b-instruct"

        // Recovery sweep: picks up recordings whose call-ended trigger was
        // blocked (MIUI/HyperOS autostart off, background FGS restrictions).
        const val EXTRA_MODE = "mode"
        const val MODE_SWEEP = "sweep"
        const val KEY_PENDING_CALL_SCAN = "pending_call_scan_at"
        private const val SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000L
        private const val SWEEP_MAX_RECORDINGS = 6
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

        val sweep = intent?.getStringExtra(EXTRA_MODE) == MODE_SWEEP
        worker = Thread {
            try {
                if (sweep) runSweep() else runPipeline()
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

        // Recorders flush within seconds of hangup; retry covers slow OEMs.
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
        // A recovery sweep may already have stored it — don't spend an ASR call.
        if (CallRecordStore.hasRecording(this, recording.absolutePath)) {
            CallRecordingFinder.markProcessed(this, recording)
            prefs.edit().remove(KEY_PENDING_CALL_SCAN).apply()
            return
        }

        processRecording(prefs, recording)
        prefs.edit().remove(KEY_PENDING_CALL_SCAN).apply()
    }

    /**
     * Recovery sweep: process every recording from the last 24 h that has no
     * call_records row. Catches calls whose end-of-call trigger was blocked
     * (MIUI/HyperOS autostart off, broadcast not delivered, FGS start denied)
     * and transient ASR failures. Started from the app-open sweep, the
     * notification listener, or the Troubleshoot button — all contexts where
     * a foreground-service start is permitted.
     */
    private fun runSweep() {
        val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("call_transcription_enabled", false)) return

        val candidates = CallRecordingFinder
            .findRecentRecordings(this, SWEEP_WINDOW_MS, SWEEP_MAX_RECORDINGS)
            .filter { !CallRecordStore.hasRecording(this, it.absolutePath) }

        if (candidates.isEmpty()) {
            prefs.edit().remove(KEY_PENDING_CALL_SCAN).apply()
            return
        }

        Log.d(TAG, "Recovery sweep: ${candidates.size} unprocessed recording(s)")
        // Oldest first so tasks and activity entries appear in natural order.
        for (file in candidates.sortedBy { it.lastModified() }) {
            try {
                processRecording(prefs, file)
            } catch (e: Exception) {
                Log.w(TAG, "Sweep failed on ${file.name}: ${e.message}")
            }
        }
        prefs.edit().remove(KEY_PENDING_CALL_SCAN).apply()
    }

    private fun processRecording(prefs: android.content.SharedPreferences, recording: java.io.File) {
        val pcm = AudioDecoder.decodeToWhisperPcm(recording.absolutePath)
        if (pcm == null || pcm.isEmpty()) {
            Log.w(TAG, "Failed to decode ${recording.absolutePath}")
            CallRecordingFinder.markProcessed(this, recording)
            // Deterministic failure — store a stub so sweeps stop retrying it.
            CallRecordStore.storeFailedRecording(this, recording.absolutePath, "Could not decode recording")
            CallRecordStore.logActivity(this, "call", "Call", "ERROR", "Could not decode recording")
            return
        }
        val durationSec = pcm.size / SAMPLE_RATE

        val result = AsrEngine.transcribe(this, pcm)
        CallRecordingFinder.markProcessed(this, recording)

        val text = when (result) {
            is AsrEngine.Result.Success -> result.text
            is AsrEngine.Result.Error -> {
                // Transient (network/service) — deliberately NOT stored, so the
                // next recovery sweep retries it until the 24 h window expires.
                Log.w(TAG, "ASR failed: ${result.message}")
                CallRecordStore.logActivity(
                    this, "call", "Call", "ERROR",
                    "Transcription failed — will retry: ${result.message}"
                )
                return
            }
            AsrEngine.Result.NoApiKey -> return
        }

        val caller = CallerResolver.resolve(this, recording)
        val callTime = caller.endedAt

        // Short call → store silently for call memory, no LLM, no notification.
        if (durationSec < MIN_ANALYSIS_DURATION_SEC ||
            text.trim().length < MIN_ANALYSIS_TRANSCRIPT_CHARS
        ) {
            Log.d(TAG, "Short call (${durationSec}s) — stored without analysis")
            CallRecordStore.storeCallResult(
                this, caller, recording.absolutePath, text, extraction = null, callTimeMs = callTime
            )
            return
        }

        // LLM analysis: extraction + verification pass, strongest free model.
        val llmKey = prefs.getString("ai_api_key", null).orEmpty()
            .ifBlank { DefaultKeys.NVIDIA_LLM }
        val model = prefs.getString("call_ai_model", null).orEmpty().ifBlank { DEFAULT_CALL_MODEL }
        val capped = if (text.length > MAX_TRANSCRIPT_CHARS) {
            text.take(MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]"
        } else text

        val llmResult = NvidiaLlmClient.extract(llmKey, model, capped, callTime, caller.label)

        if (llmResult !is NvidiaLlmClient.Result.Success) {
            // Store transcript for a JS-side retry when the app next opens.
            CallRecordStore.storeCallResult(
                this, caller, recording.absolutePath, text, extraction = null, callTimeMs = callTime
            )
            CallRecordStore.logActivity(
                this, "call", caller.label, "ERROR",
                "AI analysis failed — will retry when app opens"
            )
            return
        }

        val verified = if (llmResult.extraction.tasks.isNotEmpty()) {
            NvidiaLlmClient.verify(llmKey, model, capped, llmResult.extraction, callTime)
        } else llmResult.extraction

        val queued = CallRecordStore.storeCallResult(
            this, caller, recording.absolutePath, text, verified, callTime
        )
        if (queued < 0) return // duplicate or DB unavailable

        CallRecordStore.logActivity(
            this, "call", caller.label,
            if (queued > 0) "QUEUED" else "SKIPPED",
            if (queued > 0) "$queued task(s) from call — syncing to Google Tasks"
            else "No action items in this call"
        )

        if (queued > 0) {
            // Push the queued tasks to Google Tasks right now via headless JS.
            startOutboxFlush()
            postConfirmation(
                "Call with ${caller.label}",
                "$queued task${if (queued != 1) "s" else ""} → Google Tasks"
            )
        }
    }

    /** Starts the headless JS task that flushes the outbox to Google Tasks. */
    private fun startOutboxFlush() {
        try {
            val intent = Intent(this, TaskMindHeadlessTaskService::class.java)
            intent.putExtra("jobType", "flush_outbox")
            startService(intent)
            HeadlessJsTaskService.acquireWakeLockNow(this)
        } catch (e: Exception) {
            // Background-start restrictions — the app-open sweep will flush instead.
            Log.w(TAG, "Could not start outbox flush: ${e.message}")
        }
    }

    private fun postConfirmation(title: String, text: String) {
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val pi = PendingIntent.getActivity(
                this, title.hashCode(), launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = Notification.Builder(this, RESULT_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build()
            notificationManager.notify(title.hashCode(), notification)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to post confirmation: ${e.message}")
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
                CHANNEL_ID, "Call Transcription", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shown briefly while a call is being analysed."
                setShowBadge(false)
            }
        )
        notificationManager.createNotificationChannel(
            NotificationChannel(
                RESULT_CHANNEL_ID, "Task confirmations", NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Brief confirmations when tasks are added to Google Tasks."
            }
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
