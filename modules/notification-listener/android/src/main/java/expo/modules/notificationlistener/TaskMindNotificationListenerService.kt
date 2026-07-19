package expo.modules.notificationlistener

import android.app.Notification
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import java.util.LinkedHashMap

class TaskMindNotificationListenerService : NotificationListenerService() {

    companion object {
        const val ACTION_REFRESH_FILTER = "com.taskmind.REFRESH_FILTER"

        @Volatile
        private var serviceInstance: TaskMindNotificationListenerService? = null

        fun triggerActiveScan() {
            serviceInstance?.scanActiveNotificationsInternal()
        }

        /**
         * Replays notifications queued while JS was unreachable (OEM blocked the
         * headless start). Called when the JS context comes alive (module
         * OnCreate) and from the app-open sweep — without this, queued items
         * only drained when the NEXT notification arrived with the app open.
         */
        fun triggerDrain() {
            serviceInstance?.drainPendingQueue()
        }

        // Set by onListenerConnected/Disconnected — the service object can
        // outlive the actual system binding, so instance-null checks lie.
        @Volatile
        private var listenerBound = false

        /**
         * True only while the system actually has the listener bound. The
         * Settings permission string can say "granted" while the binding is
         * dead (e.g. after a process crash) — this is the ground truth.
         */
        fun isConnected(): Boolean = serviceInstance != null && listenerBound

        // Stage counters (prefs-backed, survive restarts) so Check Now can
        // show exactly where notifications go: seen → monitored → passed
        // filters → delivered. The gap between stages IS the diagnosis.
        val STAT_KEYS = listOf(
            "stat_seen", "stat_summary", "stat_unmonitored", "stat_discarded",
            "stat_dedup", "stat_live", "stat_headless", "stat_queued"
        )
        private const val DEDUP_WINDOW_MS = 60_000L
        private const val DEDUP_CACHE_MAX = 100
        private const val CALL_SWEEP_THROTTLE_MS = 3 * 60_000L
        private const val MAX_THREAD_MESSAGES = 10
        private const val KEY_PENDING_QUEUE = "pending_notification_queue"
        private const val MAX_PENDING_QUEUE = 50

        private val CARRIER_SENDER_REGEX = Regex("""^[A-Z]{2,3}-[A-Z0-9]{3,8}$""")
        private val OTP_DIGIT_REGEX = Regex("""\b\d{4,8}\b""")
        private val AGGREGATE_BADGE_REGEX = Regex(
            """^(\d+\s+(new\s+)?(message|notification|email|mail|unread))""",
            RegexOption.IGNORE_CASE
        )
        private val CALL_TEXT_REGEX = Regex(
            """(incoming|missed|ongoing|voice|video)\s+call""",
            RegexOption.IGNORE_CASE
        )
        private val SYNC_TEXT_REGEX = Regex(
            """^(syncing|sync complete|downloading|uploading|backing up)""",
            RegexOption.IGNORE_CASE
        )

        private val SYSTEM_PACKAGE_PREFIXES = listOf(
            "com.android.",
            "com.google.android.gms",
            "com.miui.",
            "com.vivo.",
            "com.qualcomm."
        )
    }

    private val dedupCache = object : LinkedHashMap<String, Long>(DEDUP_CACHE_MAX, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<String, Long>) = size > DEDUP_CACHE_MAX
    }

    private var monitoredApps: Set<String> = emptySet()

    private val refreshReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            loadMonitoredApps()
        }
    }

    private fun scanActiveNotificationsInternal() {
        try {
            val sbns = getActiveNotifications() ?: return
            for (sbn in sbns) {
                onNotificationPosted(sbn)
            }
        } catch (_: Exception) {}
    }

    override fun onCreate() {
        super.onCreate()
        serviceInstance = this
        loadMonitoredApps()
        val filter = IntentFilter(ACTION_REFRESH_FILTER)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(refreshReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(refreshReceiver, filter)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (serviceInstance === this) serviceInstance = null
        try {
            unregisterReceiver(refreshReceiver)
        } catch (_: Exception) { }
    }

    private fun bump(key: String) {
        try {
            val p = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            p.edit().putLong(key, p.getLong(key, 0L) + 1L).apply()
        } catch (_: Throwable) { }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        listenerBound = true
        try {
            startForegroundService(Intent(this, TaskMindForegroundService::class.java))
        } catch (_: Throwable) { }
        // If any notifications were queued while the binding was down, replay them.
        drainPendingQueue()
    }

    // Android periodically tears down the notification-listener binding (memory
    // pressure, app update, OEM policy). Without an explicit rebind request the
    // listener stays dead until reboot or a manual permission toggle — the #1
    // cause of "app suddenly stopped capturing notifications".
    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        listenerBound = false
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
            try {
                requestRebind(
                    android.content.ComponentName(this, TaskMindNotificationListenerService::class.java)
                )
            } catch (_: Exception) { }
        }
    }

    @Volatile
    private var lastCallSweepAt = 0L

    // MIUI/HyperOS frequently blocks the PHONE_STATE receiver and background
    // service starts, so a finished call may never reach CallTranscriptionService.
    // The notification-listener binding survives those restrictions (system-bound
    // process is allowed to start foreground services) — so piggyback on
    // notification traffic to launch a recovery sweep for unprocessed
    // recordings. Throttled; the service dedups against the DB, so a spurious
    // start is a cheap no-op.
    private fun maybeTriggerCallRecoverySweep() {
        val now = System.currentTimeMillis()
        if (now - lastCallSweepAt < CALL_SWEEP_THROTTLE_MS) return
        lastCallSweepAt = now
        Thread {
            try {
                val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                if (!prefs.getBoolean("call_transcription_enabled", false)) return@Thread
                val pendingCall =
                    prefs.getLong(CallTranscriptionService.KEY_PENDING_CALL_SCAN, 0L) != 0L
                val freshRecording =
                    pendingCall || CallRecordingFinder.findLatestUnprocessed(this) != null
                if (!freshRecording) return@Thread
                startForegroundService(
                    Intent(this, CallTranscriptionService::class.java)
                        .putExtra(CallTranscriptionService.EXTRA_MODE, CallTranscriptionService.MODE_SWEEP)
                )
            } catch (_: Throwable) { }
        }.start()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val packageName = sbn.packageName ?: return

        // Any notification traffic doubles as a heartbeat for missed calls.
        maybeTriggerCallRecoverySweep()

        // Skip our own notifications
        if (packageName == applicationContext.packageName) return
        bump("stat_seen")

        // Group-summary notifications (FLAG_GROUP_SUMMARY) are meta-notifications that
        // aggregate child notifications already dispatched individually — skip them.
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) {
            bump("stat_summary")
            return
        }

        // Filter by monitored apps (empty set = monitor all)
        if (monitoredApps.isNotEmpty() && !monitoredApps.contains(packageName)) {
            bump("stat_unmonitored")
            return
        }

        val extras: Bundle = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString()
        if (title == null) {
            bump("stat_discarded")
            return
        }
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: text
        val category = sbn.notification.category ?: ""

        // Hard discard filter (applied before deduplication)
        if (shouldDiscard(packageName, title, text, bigText, category)) {
            bump("stat_discarded")
            return
        }

        // Deduplication: same notification key + same content within 60 seconds.
        // Using content-aware key so distinct messages on the same conversation thread
        // (which share sbn.key in WhatsApp/Signal) each pass through independently.
        val notificationKey = sbn.key
        val now = System.currentTimeMillis()
        val contentHash = (bigText.ifBlank { text }).hashCode()
        val dedupKey = "$notificationKey|$contentHash"
        val lastSeen = dedupCache[dedupKey]
        if (lastSeen != null && (now - lastSeen) < DEDUP_WINDOW_MS) {
            bump("stat_dedup")
            return
        }
        dedupCache[dedupKey] = now

        val appName = try {
            packageManager.getApplicationLabel(
                packageManager.getApplicationInfo(packageName, 0)
            ).toString()
        } catch (_: Exception) {
            packageName
        }

        val subText = extras.getCharSequence("android.subText")?.toString() ?: ""
        val isGroup = subText.isNotBlank() || sbn.notification.group != null

        // Extract MessagingStyle conversation thread
        val thread: List<Map<String, Any>> = extractThread(sbn)
        val channelId = sbn.notification.channelId ?: ""
        val importance = try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.getNotificationChannel(channelId)?.importance ?: 3
        } catch (_: Exception) {
            3
        }

        val data = mapOf(
            "packageName" to packageName,
            "appName" to appName,
            "title" to title,
            "text" to text,
            "bigText" to bigText,
            "subText" to subText,
            "postTime" to sbn.postTime,
            "notificationKey" to notificationKey,
            "isGroup" to isGroup,
            "thread" to thread,
            "category" to category,
            "channelId" to channelId,
            "importance" to importance
        )

        dispatchNotificationData(data)
    }

    // Routes the captured notification to JS. If the React JS context is alive
    // (app open or recently backgrounded) we deliver via the live event emitter.
    // Otherwise the app was swiped away/killed, so we spin up a Headless JS task
    // that runs the exact same `handleNotification` pipeline in the background —
    // this is what makes AI classification, task creation and the persistent
    // notification keep working without the user opening the app.
    private fun dispatchNotificationData(data: Map<String, Any>) {
        // Use the live path only when JS is both running AND has an active listener.
        // The foreground service keeps the process (and thus the module instance)
        // alive after the user swipes the app, so instance alone does not prove
        // that the JS event listener is registered.
        if (NotificationListenerModule.instance != null && NotificationListenerModule.hasActiveListener) {
            // JS is alive — first flush anything that was queued while it was dead,
            // then deliver the current notification. Guarded: a conversion or
            // emitter failure must fall through to the headless path, not
            // silently swallow the notification (or crash the listener).
            try {
                drainPendingQueue()
                NotificationListenerModule.sendNotificationEvent(data)
                bump("stat_live")
                return
            } catch (t: Throwable) {
                android.util.Log.w("TaskMindListener", "Live dispatch failed: ${t.message}")
            }
        }
        try {
            val bundle = android.os.Bundle().apply {
                putString("packageName", data["packageName"] as? String ?: "")
                putString("appName", data["appName"] as? String ?: "")
                putString("title", data["title"] as? String ?: "")
                putString("text", data["text"] as? String ?: "")
                putString("bigText", data["bigText"] as? String ?: "")
                putString("subText", data["subText"] as? String ?: "")
                putDouble("postTime", ((data["postTime"] as? Long) ?: 0L).toDouble())
                putString("notificationKey", data["notificationKey"] as? String ?: "")
                putBoolean("isGroup", (data["isGroup"] as? Boolean) ?: false)
                putString("category", data["category"] as? String ?: "")
                putString("channelId", data["channelId"] as? String ?: "")
                putInt("importance", (data["importance"] as? Int) ?: 3)
                putString("threadJson", threadToJson(data["thread"]))
            }
            val intent = Intent(this, TaskMindHeadlessTaskService::class.java)
            intent.putExtras(bundle)
            // Use startForegroundService so MIUI/HyperOS background-start
            // restrictions cannot silently swallow the headless task start.
            startForegroundService(intent)
            HeadlessJsTaskService.acquireWakeLockNow(this)
            bump("stat_headless")
        } catch (_: Throwable) {
            // Background-start restrictions or context unavailable. Previously this
            // dropped the notification silently; now it's persisted to a durable
            // queue and replayed the next time the JS context is available.
            enqueuePending(data)
            bump("stat_queued")
        }
    }

    // ── Durable pending queue ────────────────────────────────────────────────
    // Notifications that could not be dispatched (headless start blocked by
    // background restrictions) are stored as JSON in SharedPreferences and
    // replayed when JS becomes reachable. Capped at 50 — oldest dropped first.

    private fun enqueuePending(data: Map<String, Any>) {
        try {
            val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            val arr = org.json.JSONArray(prefs.getString(KEY_PENDING_QUEUE, "[]") ?: "[]")
            val obj = org.json.JSONObject().apply {
                put("packageName", data["packageName"] as? String ?: "")
                put("appName", data["appName"] as? String ?: "")
                put("title", data["title"] as? String ?: "")
                put("text", data["text"] as? String ?: "")
                put("bigText", data["bigText"] as? String ?: "")
                put("subText", data["subText"] as? String ?: "")
                put("postTime", (data["postTime"] as? Long) ?: 0L)
                put("notificationKey", data["notificationKey"] as? String ?: "")
                put("isGroup", (data["isGroup"] as? Boolean) ?: false)
                put("category", data["category"] as? String ?: "")
                put("channelId", data["channelId"] as? String ?: "")
                put("importance", (data["importance"] as? Int) ?: 3)
                put("thread", org.json.JSONArray(threadToJson(data["thread"])))
            }
            arr.put(obj)
            val trimmed = if (arr.length() > MAX_PENDING_QUEUE) {
                org.json.JSONArray().also { t ->
                    for (i in arr.length() - MAX_PENDING_QUEUE until arr.length()) t.put(arr.get(i))
                }
            } else arr
            prefs.edit().putString(KEY_PENDING_QUEUE, trimmed.toString()).apply()
        } catch (_: Exception) { }
    }

    internal fun drainPendingQueue() {
        if (NotificationListenerModule.instance == null) return
        try {
            val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_PENDING_QUEUE, null) ?: return
            val arr = org.json.JSONArray(raw)
            if (arr.length() == 0) return
            prefs.edit().remove(KEY_PENDING_QUEUE).apply()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val thread = mutableListOf<Map<String, Any>>()
                val tArr = obj.optJSONArray("thread") ?: org.json.JSONArray()
                for (j in 0 until tArr.length()) {
                    val m = tArr.getJSONObject(j)
                    thread.add(
                        mapOf(
                            "sender" to m.optString("sender", ""),
                            "text" to m.optString("text", ""),
                            "timestamp" to m.optLong("timestamp", 0L)
                        )
                    )
                }
                val data = mapOf(
                    "packageName" to obj.optString("packageName", ""),
                    "appName" to obj.optString("appName", ""),
                    "title" to obj.optString("title", ""),
                    "text" to obj.optString("text", ""),
                    "bigText" to obj.optString("bigText", ""),
                    "subText" to obj.optString("subText", ""),
                    "postTime" to obj.optLong("postTime", 0L),
                    "notificationKey" to obj.optString("notificationKey", ""),
                    "isGroup" to obj.optBoolean("isGroup", false),
                    "thread" to thread,
                    "category" to obj.optString("category", ""),
                    "channelId" to obj.optString("channelId", ""),
                    "importance" to obj.optInt("importance", 3)
                )
                NotificationListenerModule.sendNotificationEvent(data)
            }
        } catch (_: Exception) { }
    }

    @Suppress("UNCHECKED_CAST")
    private fun threadToJson(thread: Any?): String {
        val list = thread as? List<Map<String, Any>> ?: return "[]"
        val arr = org.json.JSONArray()
        for (msg in list) {
            val obj = org.json.JSONObject()
            obj.put("sender", msg["sender"] ?: "")
            obj.put("text", msg["text"] ?: "")
            obj.put("timestamp", msg["timestamp"] ?: 0L)
            arr.put(obj)
        }
        return arr.toString()
    }

    private fun extractThread(sbn: StatusBarNotification): List<Map<String, Any>> {
        val style = NotificationCompat.MessagingStyle
            .extractMessagingStyleFromNotification(sbn.notification)
            ?: return emptyList()

        val userPerson = style.user
        return style.messages
            .takeLast(MAX_THREAD_MESSAGES)
            .map { message ->
                // The user's own outgoing replies share the conversation's "user" Person
                // (and often have no/empty sender name) — tag them explicitly so the AI
                // extractor can tell self-authored messages apart from the contact's.
                val isSelf = message.person != null && message.person == userPerson
                val senderName = when {
                    isSelf -> "You"
                    else -> message.person?.name?.toString() ?: ""
                }
                mapOf(
                    "sender" to senderName,
                    "text" to (message.text?.toString() ?: ""),
                    "timestamp" to message.timestamp
                )
            }
    }

    private fun shouldDiscard(
        packageName: String,
        title: String,
        text: String,
        bigText: String,
        category: String
    ): Boolean {
        // Zero content
        if (text.isBlank() && bigText.isBlank()) return true

        // System/sync packages — but NEVER discard an explicitly monitored app:
        // com.android.mms is MIUI/stock Android's SMS app and would otherwise
        // be swallowed by the "com.android." prefix.
        if (!monitoredApps.contains(packageName) &&
            SYSTEM_PACKAGE_PREFIXES.any { packageName.startsWith(it) }
        ) return true

        // Call notifications (Android category or text pattern)
        if (category == Notification.CATEGORY_CALL) return true
        if (CALL_TEXT_REGEX.containsMatchIn(text) || CALL_TEXT_REGEX.containsMatchIn(title)) return true

        // Sync/progress/download notifications
        if (category == Notification.CATEGORY_PROGRESS) return true
        if (SYNC_TEXT_REGEX.containsMatchIn(text) || SYNC_TEXT_REGEX.containsMatchIn(title)) return true

        // Carrier sender ID pattern (e.g. "VM-AMAZON", "AD-HDFC")
        if (CARRIER_SENDER_REGEX.matches(title)) return true

        // OTP/verification messages
        if (OTP_DIGIT_REGEX.containsMatchIn(text) &&
            (text.contains("OTP", ignoreCase = true) ||
             text.contains("verification code", ignoreCase = true) ||
             text.contains("one time", ignoreCase = true))
        ) return true

        // Aggregate badge notifications ("3 new messages", "5 unread", etc.)
        if (AGGREGATE_BADGE_REGEX.containsMatchIn(text)) return true

        return false
    }

    private fun loadMonitoredApps() {
        val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
        monitoredApps = prefs.getStringSet("monitored_apps", emptySet()) ?: emptySet()
    }
}
