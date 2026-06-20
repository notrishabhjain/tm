package expo.modules.notificationlistener

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import androidx.core.content.ContextCompat
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Produces a step-by-step picture of the in-app call-transcription pipeline so
 * the debug screen can show exactly which stage fails. Nothing here mutates
 * pipeline state, so it is safe to run repeatedly while diagnosing.
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

    private fun apiKeySet(context: Context): Boolean {
        val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
        return prefs.getString("nvidia_api_key", null).orEmpty().isNotBlank()
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
            "apiKeySet" to apiKeySet(context),
            "lastProcessedPath" to prefs.getString("call_transcription_last_recording", null),
            "latestUnprocessedPath" to latest?.absolutePath,
            "latestUnprocessedAgeMs" to latest?.let { (now - it.lastModified()).toDouble() },
            "dirs" to dirReports,
            "recentRecordings" to recentReports
        )
    }

    /**
     * Runs the full decode + cloud-transcribe pipeline on the newest recording
     * found. Ignores both the "enabled" flag and the last-processed marker.
     * [onLog] is called at each stage for real-time display. Call off the main thread.
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
                    "Check that all-files access is granted and your recorder saves to one of the listed folders."
            )
        }

        val ageSec = (now - recording.lastModified()) / 1000
        val sizeKb = recording.length() / 1024
        onLog?.invoke("find", "Found: ${recording.name} ($sizeKb KB, ${ageSec}s old)")

        // Check API key
        val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
        val apiKey = prefs.getString("nvidia_api_key", null).orEmpty()
        if (apiKey.isBlank()) {
            onLog?.invoke("apikey", "FAILED — NVIDIA API key not set")
            return mapOf(
                "ok" to false,
                "stage" to "apikey",
                "recordingPath" to recording.absolutePath,
                "error" to "NVIDIA API key is not set. Enter it in the Call Transcription settings."
            )
        }
        onLog?.invoke("apikey", "API key present (${apiKey.take(8)}…)")

        // Check network reachability to NVIDIA endpoint
        onLog?.invoke("network", "Checking connectivity to grpc.nvcf.nvidia.com:443…")
        val reachable = try {
            Socket().use { s ->
                s.connect(InetSocketAddress("grpc.nvcf.nvidia.com", 443), 5_000)
                true
            }
        } catch (_: Exception) { false }
        if (!reachable) {
            onLog?.invoke("network", "FAILED — cannot reach grpc.nvcf.nvidia.com:443")
            return mapOf(
                "ok" to false,
                "stage" to "network",
                "recordingPath" to recording.absolutePath,
                "error" to "Cannot reach grpc.nvcf.nvidia.com:443. Check internet connection."
            )
        }
        onLog?.invoke("network", "Network OK")

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
        onLog?.invoke("decode", "Decoded %.1fs of audio in %dms".format(durationSec, decodeMs))

        onLog?.invoke("transcribe", "Sending %.1fs of audio to NVIDIA cloud ASR…".format(durationSec))

        val transcribeStart = System.currentTimeMillis()
        val result = NvidiaAsrClient.transcribe(apiKey, pcm)
        val transcribeMs = System.currentTimeMillis() - transcribeStart

        return when (result) {
            is NvidiaAsrClient.Result.Success -> {
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
            is NvidiaAsrClient.Result.Error -> {
                onLog?.invoke("transcribe", "FAILED — ${result.message}")
                mapOf(
                    "ok" to false,
                    "stage" to "transcribe",
                    "recordingPath" to recording.absolutePath,
                    "decodedSamples" to pcm.size.toDouble(),
                    "decodeMs" to decodeMs.toDouble(),
                    "transcribeMs" to transcribeMs.toDouble(),
                    "error" to result.message
                )
            }
            NvidiaAsrClient.Result.NoApiKey -> {
                onLog?.invoke("apikey", "FAILED — API key disappeared during test")
                mapOf(
                    "ok" to false,
                    "stage" to "apikey",
                    "error" to "API key not set."
                )
            }
        }
    }
}
