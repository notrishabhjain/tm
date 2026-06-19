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
     * triggered on demand. [onLog] is called at each stage with a stage key and a
     * human-readable message — callers can forward these to the JS bridge for
     * real-time display. Heavy — call off the main thread.
     */
    fun runFullTest(
        context: Context,
        onLog: ((stage: String, message: String) -> Unit)? = null
    ): Map<String, Any?> {
        val now = System.currentTimeMillis()
        val dirs = CallRecordingFinder.candidateDirs(context)
        onLog?.invoke("start", "Scanning ${dirs.size} folder(s) for audio files…")

        var newest: File? = null
        for (path in dirs) {
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

        val recording = newest ?: run {
            onLog?.invoke("find", "FAILED — no audio file found in any candidate folder")
            return mapOf(
                "ok" to false,
                "stage" to "find",
                "error" to "No audio recording found in any candidate folder. " +
                    "Check that all-files access is granted and that your recorder saves to one of the listed folders."
            )
        }

        val ageSec = (now - recording.lastModified()) / 1000
        val sizeKb = recording.length() / 1024
        onLog?.invoke("find", "Found: ${recording.name} (${sizeKb} KB, ${ageSec}s old)")

        if (!WhisperModelManager.isModelDownloaded(context)) {
            onLog?.invoke("model", "FAILED — model not downloaded")
            return mapOf(
                "ok" to false,
                "stage" to "model",
                "recordingPath" to recording.absolutePath,
                "error" to "Whisper model is not downloaded."
            )
        }
        onLog?.invoke("model", "Model OK: ${WhisperModelManager.MODEL_FILENAME}")

        if (!(WhisperJNI.ensureLoaded() && WhisperJNI.isReal())) {
            onLog?.invoke("engine", "FAILED — engine not built into this APK")
            return mapOf(
                "ok" to false,
                "stage" to "engine",
                "recordingPath" to recording.absolutePath,
                "error" to "On-device whisper engine is not built into this APK."
            )
        }
        onLog?.invoke("engine", "Engine loaded OK")

        onLog?.invoke("decode", "Decoding ${recording.name}…")
        val decodeStart = System.currentTimeMillis()
        val pcm = AudioDecoder.decodeToWhisperPcm(recording.absolutePath)
        val decodeMs = System.currentTimeMillis() - decodeStart

        if (pcm == null || pcm.isEmpty()) {
            onLog?.invoke("decode", "FAILED — could not decode audio (unsupported codec or unreadable file)")
            return mapOf(
                "ok" to false,
                "stage" to "decode",
                "recordingPath" to recording.absolutePath,
                "recordingAgeMs" to (now - recording.lastModified()).toDouble(),
                "error" to "Failed to decode audio (unsupported codec or unreadable file)."
            )
        }

        val durationSec = pcm.size / 16000.0
        onLog?.invoke(
            "decode",
            "Decoded %.1fs of audio in %dms".format(durationSec, decodeMs)
        )

        val estSec = (durationSec * 15).toInt().coerceAtLeast(5)
        onLog?.invoke(
            "transcribe",
            "Transcribing %.1fs of audio — estimated ~%ds on this device. Keep screen on.".format(
                durationSec, estSec
            )
        )

        val modelPath = WhisperModelManager.modelFile(context).absolutePath
        val transcribeStart = System.currentTimeMillis()
        val result = WhisperTranscriber.transcribe(modelPath, pcm)
        val transcribeMs = System.currentTimeMillis() - transcribeStart

        return when (result) {
            is WhisperTranscriber.Result.Success -> {
                onLog?.invoke(
                    "transcribe",
                    "Done in %.1fs. Preview: %s".format(
                        transcribeMs / 1000.0,
                        result.text.take(100).replace('\n', ' ')
                    )
                )
                mapOf(
                    "ok" to true,
                    "stage" to "transcribe",
                    "recordingPath" to recording.absolutePath,
                    "recordingAgeMs" to (now - recording.lastModified()).toDouble(),
                    "decodedSamples" to pcm.size.toDouble(),
                    "decodeMs" to decodeMs.toDouble(),
                    "transcribeMs" to transcribeMs.toDouble(),
                    "transcript" to result.text
                )
            }
            WhisperTranscriber.Result.EngineNotBuilt -> {
                onLog?.invoke("transcribe", "FAILED — engine not built")
                mapOf(
                    "ok" to false, "stage" to "transcribe",
                    "recordingPath" to recording.absolutePath,
                    "error" to "Engine not built."
                )
            }
            WhisperTranscriber.Result.ModelMissing -> {
                onLog?.invoke("transcribe", "FAILED — model failed to load from disk")
                mapOf(
                    "ok" to false, "stage" to "transcribe",
                    "recordingPath" to recording.absolutePath,
                    "error" to "Model failed to load."
                )
            }
            WhisperTranscriber.Result.TranscriptionFailed -> {
                onLog?.invoke(
                    "transcribe",
                    "FAILED after %.1fs — no text produced (silent or unintelligible audio)".format(
                        transcribeMs / 1000.0
                    )
                )
                mapOf(
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
}
