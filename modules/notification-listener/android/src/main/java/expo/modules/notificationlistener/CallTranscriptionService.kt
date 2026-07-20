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
        val sweep = intent?.getStringExtra(EXTRA_MODE) == MODE_SWEEP

        val foregrounded = try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID, buildProgressNotification(),
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIFICATION_ID, buildProgressNotification())
            }
            true
        } catch (t: Throwable) {
            // dataSync budget exhausted or background start denied — degrade,
            // never crash (a crash kills the notification listener too).
            Log.w(TAG, "startForeground denied: ${t.message} — running detached")
            false
        }

        if (worker?.isAlive == true) {
            if (!foregrounded) stopSelf()
            return START_NOT_STICKY
        }

        if (foregrounded) {
            worker = Thread {
                try {
                    if (sweep) runSweep() else runPipeline()
                } catch (t: Throwable) {
                    // Throwable, not Exception: an OOM here must not kill the app
                    // process — that takes the notification listener down with it.
                    Log.w(TAG, "Pipeline failed: ${t.javaClass.simpleName}: ${t.message}")
                } finally {
                    try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Throwable) {}
                    stopSelf()
                }
            }.also { it.start() }
        } else {
            // The service must stop immediately (unfulfilled startForeground
            // contract triggers an ANR otherwise) — run the work detached; the
            // process stays alive via the listener binding.
            Thread {
                try {
                    if (sweep) runSweep() else runPipeline()
                } catch (t: Throwable) {
                    Log.w(TAG, "Detached pipeline failed: ${t.javaClass.simpleName}: ${t.message}")
                }
            }.start()
            stopSelf()
        }

        return START_NOT_STICKY
    }

    // Android 15 calls this when the dataSync time budget runs out mid-run; the
    // service must stop promptly or the system kills the app. The worker thread
    // survives the service stop and finishes its current recording.
    override fun onTimeout(startId: Int) {
        Log.w(TAG, "dataSync time budget exhausted — stopping service")
        try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Throwable) {}
        stopSelf()
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
            } catch (t: Throwable) {
                Log.w(TAG, "Sweep failed on ${file.name}: ${t.javaClass.simpleName}: ${t.message}")
            }
        }
        prefs.edit().remove(KEY_PENDING_CALL_SCAN).apply()
    }

    private fun processRecording(prefs: android.content.SharedPreferences, recording: java.io.File) {
        val caller = CallerResolver.resolve(this, recording)
        val callTime = caller.endedAt

        // ASR → LLM pipeline: Groq Whisper (ASR) → Groq 70B → OpenRouter 70B → NVIDIA (last resort).
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

        // LLM analysis: extraction + verification pass.
        // Chain: Groq 70B → OpenRouter 70B → NVIDIA 70B (last resort).
        val capped = if (text.length > MAX_TRANSCRIPT_CHARS) {
            text.take(MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]"
        } else text

        val groqKey = prefs.getString("groq_api_key", null).orEmpty().ifBlank { DefaultKeys.GROQ }
        val openrouterKey = prefs.getString("openrouter_api_key", null).orEmpty().ifBlank { DefaultKeys.OPENROUTER }
        val nvidiaKey = prefs.getString("ai_api_key", null).orEmpty().ifBlank { DefaultKeys.NVIDIA_LLM }
        val nvidiaModel = prefs.getString("call_ai_model", null).orEmpty().ifBlank { DEFAULT_CALL_MODEL }

        var usedEngine = "groq"
        var llmResult = NvidiaLlmClient.extractWithGroq(groqKey, capped, callTime, caller.label)
        if (llmResult !is NvidiaLlmClient.Result.Success) {
            Log.w(TAG, "Groq LLM failed — trying OpenRouter")
            llmResult = NvidiaLlmClient.extractWithOpenRouter(openrouterKey, capped, callTime, caller.label)
            usedEngine = "openrouter"
        }
        if (llmResult !is NvidiaLlmClient.Result.Success) {
            Log.w(TAG, "OpenRouter LLM failed — trying NVIDIA as last resort")
            llmResult = NvidiaLlmClient.extract(nvidiaKey, nvidiaModel, capped, callTime, caller.label)
            usedEngine = "nvidia"
        }

        if (llmResult !is NvidiaLlmClient.Result.Success) {
            // All network LLM engines failed — try fully on-device analysis.
            // Quality is lower than LLM (pattern-matching, not semantic understanding)
            // but works offline and reliably catches explicit spoken commitments.
            Log.d(TAG, "All network LLMs failed — running on-device LocalCallAnalyzer")
            val onDeviceExtraction = LocalCallAnalyzer.analyze(this, capped, callTime, caller.label)
            if (onDeviceExtraction.tasks.isNotEmpty()) {
                storeAndFinish(caller, recording.absolutePath, text, onDeviceExtraction, callTime)
            } else {
                // On-device found nothing — store transcript so the next time the
                // app opens it can re-analyse with a network LLM.
                CallRecordStore.storeCallResult(
                    this, caller, recording.absolutePath, text, extraction = null, callTimeMs = callTime
                )
                CallRecordStore.logActivity(
                    this, "call", caller.label, "ERROR",
                    "AI analysis failed (offline — no explicit tasks detected) — will retry when app opens"
                )
            }
            return
        }

        // Verify pass uses the same engine that succeeded at extraction.
        val verified = if (llmResult.extraction.tasks.isNotEmpty()) {
            when (usedEngine) {
                "openrouter" -> NvidiaLlmClient.verifyWithOpenRouter(openrouterKey, capped, llmResult.extraction, callTime)
                "nvidia" -> NvidiaLlmClient.verify(nvidiaKey, nvidiaModel, capped, llmResult.extraction, callTime)
                else -> NvidiaLlmClient.verifyWithGroq(groqKey, capped, llmResult.extraction, callTime)
            }
        } else llmResult.extraction

        storeAndFinish(caller, recording.absolutePath, text, verified, callTime)
    }

    /** Stores the call + queues its tasks, logs the outcome, syncs, confirms. */
    private fun storeAndFinish(
        caller: CallerResolver.ResolvedCaller,
        recordingPath: String,
        transcript: String,
        extraction: NvidiaLlmClient.CallExtraction?,
        callTimeMs: Long
    ) {
        val queued = CallRecordStore.storeCallResult(
            this, caller, recordingPath, transcript, extraction, callTimeMs
        )
        if (queued < 0) return // duplicate or DB unavailable
        if (extraction == null) return // short call — stored silently as call memory

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
