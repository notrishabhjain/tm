package expo.modules.notificationlistener

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CallLog
import android.provider.ContactsContract
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Resolves who the just-finished call was with. Fixes the "Unknown caller" bug:
 * the call-log row often lands a few seconds AFTER the call ends, so a single
 * immediate query either finds nothing or a stale earlier call. This resolver
 * retries, and only accepts a row whose end time is close to the recording's
 * modification time — never mis-attributing a previous call.
 */
object CallerResolver {
    private const val TAG = "CallerResolver"

    // A call-log row matches the recording when its end time (DATE + DURATION)
    // is within this window of the recording file's mtime.
    private const val MATCH_WINDOW_MS = 3 * 60 * 1000L
    private val RETRY_DELAYS_MS = longArrayOf(0, 2_000, 4_000)

    data class ResolvedCaller(
        val label: String,
        val number: String?,
        val endedAt: Long,
        val durationSec: Long?
    )

    fun resolve(context: Context, recording: File): ResolvedCaller {
        val recordingTime = recording.lastModified()

        for (delay in RETRY_DELAYS_MS) {
            if (delay > 0) Thread.sleep(delay)
            val row = queryMatchingCallLogRow(context, recordingTime)
            if (row != null) {
                val label = row.cachedName?.takeIf { it.isNotBlank() }
                    ?: row.number?.let { lookupContactName(context, it) }
                    ?: row.number
                    ?: numberFromFilename(recording)
                    ?: "Unknown"
                return ResolvedCaller(
                    label = label,
                    number = row.number,
                    endedAt = row.date + row.duration * 1000,
                    durationSec = row.duration
                )
            }
        }

        Log.d(TAG, "No matching call-log row after retries — falling back to filename")
        return ResolvedCaller(
            label = numberFromFilename(recording) ?: "Unknown",
            number = numberFromFilename(recording),
            endedAt = recordingTime,
            durationSec = null
        )
    }

    private data class CallLogRow(
        val cachedName: String?,
        val number: String?,
        val date: Long,
        val duration: Long
    )

    private fun queryMatchingCallLogRow(context: Context, recordingTime: Long): CallLogRow? {
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALL_LOG)
            != PackageManager.PERMISSION_GRANTED
        ) return null

        return try {
            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(
                    CallLog.Calls.CACHED_NAME,
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.DATE,
                    CallLog.Calls.DURATION
                ),
                null,
                null,
                // Deep enough that recovery sweeps can attribute recordings from
                // hours ago; the end-time window still prevents mis-attribution.
                "${CallLog.Calls.DATE} DESC LIMIT 50"
            )?.use { cursor ->
                while (cursor.moveToNext()) {
                    val date = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE))
                    val duration = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION))
                    val endedAt = date + duration * 1000
                    if (kotlin.math.abs(endedAt - recordingTime) <= MATCH_WINDOW_MS) {
                        return CallLogRow(
                            cachedName = cursor.getString(
                                cursor.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)
                            ),
                            number = cursor.getString(
                                cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
                            ),
                            date = date,
                            duration = duration
                        )
                    }
                }
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Call log query failed: ${e.message}")
            null
        }
    }

    /** Resolves a phone number to a contact display name via PhoneLookup. */
    private fun lookupContactName(context: Context, number: String): String? {
        if (number.isBlank()) return null
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED
        ) return null

        return try {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(number)
            )
            context.contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null, null, null
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0)?.takeIf { it.isNotBlank() } else null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Contact lookup failed: ${e.message}")
            null
        }
    }

    private fun numberFromFilename(recording: File): String? {
        return Regex("\\+?[0-9]{6,15}").find(recording.nameWithoutExtension)?.value
    }
}
