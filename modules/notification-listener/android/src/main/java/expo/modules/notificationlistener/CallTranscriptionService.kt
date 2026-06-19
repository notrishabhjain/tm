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
 * find the newest call recording, decode it, transcribe it on-device with
 * whisper.cpp, and hand the transcript to JS the same way the Termux flow
 * does (review screen at /call-transcript) — but without Termux or
 * MacroDroid. Started by TaskMindForegroundService a short delay after a
 * call ends.
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

        // Some recorder apps take longer than the initial delay to flush the file to
        // disk (WhatsApp ~15 s, VoIP recorders up to 25 s after the initial 30 s wait).
        // Retry every 15 s for up to 90 s before giving up.
        var recording = CallRecordingFinder.findLatestUnprocessed(this)
        if (recording == null) {
            for (attempt in 1..6) {
                Thread.sleep(15_000)
                recording = CallRecordingFinder.findLatestUnprocessed(this)
                if (recording != null) break
            }
        }
        if (recording == null) {
            Log.d(TAG, "No new call recording found after retries")
            return
        }

        if (!WhisperModelManager.isModelDownloaded(this)) {
            Log.w(TAG, "Whisper model not downloaded — skipping transcription")
            return
        }

        val pcm = AudioDecoder.decodeToWhisperPcm(recording.absolutePath)
        if (pcm == null || pcm.isEmpty()) {
            Log.w(TAG, "Failed to decode ${recording.absolutePath}")
            CallRecordingFinder.markProcessed(this, recording)
            return
        }

        val modelPath = WhisperModelManager.modelFile(this).absolutePath
        val result = WhisperTranscriber.transcribe(modelPath, pcm)
        // Mark processed regardless of outcome so a permanently-failing file
        // doesn't get retried on every subsequent call.
        CallRecordingFinder.markProcessed(this, recording)

        val text = when (result) {
            is WhisperTranscriber.Result.Success -> result.text
            WhisperTranscriber.Result.EngineNotBuilt -> {
                Log.w(TAG, "whisper.cpp native engine not built into this APK")
                return
            }
            WhisperTranscriber.Result.ModelMissing -> {
                Log.w(TAG, "whisper model failed to load")
                return
            }
            WhisperTranscriber.Result.TranscriptionFailed -> {
                Log.w(TAG, "Transcription produced no text")
                return
            }
        }

        val callInfo = CallLogHelper.lastCall(this)
        val callerLabel = callInfo?.callerLabel
            ?: recording.nameToCallerLabel()
            ?: "Unknown"
        val callTime = callInfo?.endedAt ?: recording.lastModified()

        // Persist transcript so the app can pick it up when it resumes from background
        // (sendCallTranscriptReady's sendEvent is a no-op if the JS bridge isn't active).
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
            description = "Shown briefly while a call recording is transcribed on-device."
            setShowBadge(false)
        }
        notificationManager.createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
