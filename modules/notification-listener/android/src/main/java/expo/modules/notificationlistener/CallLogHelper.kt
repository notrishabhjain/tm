package expo.modules.notificationlistener

import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat

data class LastCallInfo(val callerLabel: String, val endedAt: Long)

/**
 * Reads the most recent call from the system call log to label a
 * just-finished call. Requires READ_CALL_LOG (declined gracefully).
 */
object CallLogHelper {

    fun lastCall(context: Context): LastCallInfo? {
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALL_LOG)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return null
        }

        val projection = arrayOf(
            CallLog.Calls.CACHED_NAME,
            CallLog.Calls.NUMBER,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
        )

        return try {
            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                "${CallLog.Calls.DATE} DESC LIMIT 1"
            )?.use { cursor ->
                if (!cursor.moveToFirst()) return null
                val name = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME))
                val number = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER))
                val date = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE))
                val duration = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION))
                val label = name?.takeIf { it.isNotBlank() } ?: number ?: "Unknown"
                LastCallInfo(callerLabel = label, endedAt = date + duration * 1000)
            }
        } catch (_: Exception) {
            null
        }
    }
}
