package expo.modules.notificationlistener

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Produces a step-by-step picture of the in-app call-transcription pipeline so
 * the debug screen can show exactly which stage fails — trigger registration,
 * recording discovery, file access, decode, or transcription. Nothing here
 * mutates pipeline state (it never marks a recording processed), so it is safe
 * to run repeatedly while diagnosing.
 */
object CallTranscriptionDiagnostics {

    private val AUDIO_EXTENSIONS =
        setOf("m4a", "amr", "3gp", "mp3", "wav", "aac", "opus", "ogg")

    private fun hasPermission(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun hasAllFilesAccess(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            hasPermission(context, android.Manifest.permission.READ_EXTERNAL_STORAGE)
        }

    /** Fast inspection — prerequisites, trigger state, and what files are visible. */
    fun inspect(context: Context): Map<String, Any?> {
        val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)

        val dirReports = CallRecordingFinder.candidateDirs(context).map { path ->
            val dir = File(path)
            val files = try {
                dir.listFiles { f -> f.isFile && AUDIO_EXTENSIONS.contains(f.extension.lowercase()) }
            } catch (_: Exception) {
                null
            }
            mapOf(
                "path" to path,
                "exists" to dir.exists(),
                "isDirectory" to dir.isDirectory,
                "canRead" to dir.canRead(),
                "audioFileCount" to (files?.size ?: 0)
            )
        }

        // Newest 10 audio files across every candidate dir, with age + size.
        val now = System.currentTimeMillis()
        val allFiles = mutableListOf<File>()
        for (path in CallRecordingFinder.candidateDirs(context)) {
            val files = try {
                File(path).listFiles { f ->
                    f.isFile && AUDIO_EXTENSIONS.contains(f.extension.lowercase())
                }
            } catch (_: Exception) {
                null
            }
            if (files != null) allFiles.addAll(files)
        }
        val recentReports = allFiles
            .sortedByDescending { it.lastModified() }
            .take(10)
            .map { f ->
                mapOf(
                    "name" to f.name,
                    "path" to f.absolutePath,
                    "ageMs" to (now - f.lastModified()).toDouble(),
                    "sizeBytes" to f.length().toDouble()
                )
            }

        val latest = CallRecordingFinder.findLatestUnprocessed(context)

        return mapOf(
            "enabled" to prefs.getBoolean("call_transcription_enabled", false),
            "monitorRegistered" to CallStateMonitor.isRegistered(),
            "foregroundServiceRunning" to TaskMindForegroundService.isRunning,
            "hasPhoneStatePermission" to hasPermission(context, android.Manifest.permission.READ_PHONE_STATE),
            "hasCallLogPermission" to hasPermission(context, android.Manifest.permission.READ_CALL_LOG),
            "hasAllFilesAccess" to hasAllFilesAccess(context),
            "modelDownloaded" to WhisperModelManager.isModelDownloaded(context),
            "engineBuilt" to (WhisperJNI.ensureLoaded() && WhisperJNI.isReal()),
            "lastProcessedPath" to prefs.getString("call_transcription_last_recording", null),
            "latestUnprocessedPath" to latest?.absolutePath,
            "latestUnprocessedAgeMs" to latest?.let { (now - it.lastModified()).toDouble() },
            "dirs" to dirReports,
            "recentRecordings" to recentReports
        )
    }

    /**
     * Runs the full decode + transcribe pipeline on the newest recording found,
     * ignoring both the "enabled" flag and the last-processed marker so it can be
     * triggered on demand. Returns a step-by-step report. Heavy — call off the
     * main thread.
     */
    fun runFullTest(context: Context): Map<String, Any?> {
        val now = System.currentTimeMillis()

        // Find newest audio file across candidate dirs (ignore processed marker).
        var newest: File? = null
        for (path in CallRecordingFinder.candidateDirs(context)) {
            val files = try {
                File(path).listFiles { f ->
                    f.isFile && AUDIO_EXTENSIONS.contains(f.extension.lowercase())
                }
            } catch (_: Exception) {
                null
            } ?: continue
            for (f in files) {
                if (newest == null || f.lastModified() > newest!!.lastModified()) newest = f
            }
        }

        val recording = newest
            ?: return mapOf(
                "ok" to false,
                "stage" to "find",
                "error" to "No audio recording found in any candidate folder. " +
                    "Check that all-files access is granted and that your recorder saves to one of the listed folders."
            )

        if (!WhisperModelManager.isModelDownloaded(context)) {
            return mapOf(
                "ok" to false,
                "stage" to "model",
                "recordingPath" to recording.absolutePath,
                "error" to "Whisper model is not downloaded."
            )
        }

        if (!(WhisperJNI.ensureLoaded() && WhisperJNI.isReal())) {
            return mapOf(
                "ok" to false,
                "stage" to "engine",
                "recordingPath" to recording.absolutePath,
                "error" to "On-device whisper engine is not built into this APK."
            )
        }

        val decodeStart = System.currentTimeMillis()
        val pcm = AudioDecoder.decodeToWhisperPcm(recording.absolutePath)
        val decodeMs = System.currentTimeMillis() - decodeStart
        if (pcm == null || pcm.isEmpty()) {
            return mapOf(
                "ok" to false,
                "stage" to "decode",
                "recordingPath" to recording.absolutePath,
                "recordingAgeMs" to (now - recording.lastModified()).toDouble(),
                "error" to "Failed to decode audio (unsupported codec or unreadable file)."
            )
        }

        val transcribeStart = System.currentTimeMillis()
        val modelPath = WhisperModelManager.modelFile(context).absolutePath
        val result = WhisperTranscriber.transcribe(modelPath, pcm)
        val transcribeMs = System.currentTimeMillis() - transcribeStart

        return when (result) {
            is WhisperTranscriber.Result.Success -> mapOf(
                "ok" to true,
                "stage" to "transcribe",
                "recordingPath" to recording.absolutePath,
                "recordingAgeMs" to (now - recording.lastModified()).toDouble(),
                "decodedSamples" to pcm.size.toDouble(),
                "decodeMs" to decodeMs.toDouble(),
                "transcribeMs" to transcribeMs.toDouble(),
                "transcript" to result.text
            )
            WhisperTranscriber.Result.EngineNotBuilt -> mapOf(
                "ok" to false, "stage" to "transcribe",
                "recordingPath" to recording.absolutePath,
                "error" to "Engine not built."
            )
            WhisperTranscriber.Result.ModelMissing -> mapOf(
                "ok" to false, "stage" to "transcribe",
                "recordingPath" to recording.absolutePath,
                "error" to "Model failed to load."
            )
            WhisperTranscriber.Result.TranscriptionFailed -> mapOf(
                "ok" to false, "stage" to "transcribe",
                "recordingPath" to recording.absolutePath,
                "decodedSamples" to pcm.size.toDouble(),
                "decodeMs" to decodeMs.toDouble(),
                "transcribeMs" to transcribeMs.toDouble(),
                "error" to "Transcription produced no text (silent or unintelligible audio)."
            )
        }
    }
}
