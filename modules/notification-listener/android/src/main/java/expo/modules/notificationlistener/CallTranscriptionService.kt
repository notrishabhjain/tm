package expo.modules.notificationlistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * Foreground service that runs the in-app call-transcription pipeline:
 * find the newest call recording, decode it to PCM, send to NVIDIA cloud ASR
 * (Whisper Large V3 over gRPC), and hand the transcript to the JS review screen.
 */
class CallTranscriptionService : Service() {

    companion object {
        private const val TAG = "CallTranscriptionSvc"
        const val NOTIFICATION_ID = 1002
        const val CHANNEL_ID = "taskmind_call_transcription"
    }

    private lateinit var notificationManager: NotificationManager
    private var worker: Thread? = null

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(NotificationManager::class.java)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

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

        val apiKey = prefs.getString("nvidia_api_key", null).orEmpty()
        if (apiKey.isBlank()) {
            Log.w(TAG, "NVIDIA API key not set — skipping transcription")
            return
        }

        // Most recorder apps flush within a few seconds of the call ending.
        // Short back-off (3 s / 6 s / 10 s ≈ 19 s total) instead of the old
        // fixed 15 s × 6 = 90 s — keeps the foreground service shorter-lived.
        var recording = CallRecordingFinder.findLatestUnprocessed(this)
        if (recording == null) {
            val retryDelaysMs = longArrayOf(3_000, 6_000, 10_000)
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

        val result = NvidiaAsrClient.transcribe(apiKey, pcm)
        CallRecordingFinder.markProcessed(this, recording)

        val text = when (result) {
            is NvidiaAsrClient.Result.Success -> result.text
            is NvidiaAsrClient.Result.Error  -> { Log.w(TAG, "NVIDIA ASR failed: ${result.message}"); return }
            NvidiaAsrClient.Result.NoApiKey  -> { Log.w(TAG, "NVIDIA API key missing"); return }
        }

        val callInfo = CallLogHelper.lastCall(this)
        val callerLabel = callInfo?.callerLabel
            ?: recording.nameToCallerLabel()
            ?: "Unknown"
        val callTime = callInfo?.endedAt ?: recording.lastModified()

        getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE).edit()
            .putString("pending_transcript_text", text)
            .putLong("pending_transcript_time", callTime)
            .putString("pending_transcript_caller", callerLabel)
            .apply()

        NotificationListenerModule.sendCallTranscriptReady(text, callTime, callerLabel)
        TaskWidgetProvider.triggerUpdate(this)
    }

    private fun java.io.File.nameToCallerLabel(): String? {
        val match = Regex("\\+?[0-9]{6,15}").find(this.nameWithoutExtension)
        return match?.value
    }

    private fun buildNotification(): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("TaskMind")
            .setContentText("Transcribing your last call…")
            .setOngoing(true)
            .setShowWhen(false)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Call Transcription",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shown briefly while a call is being transcribed."
            setShowBadge(false)
        }
        notificationManager.createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
