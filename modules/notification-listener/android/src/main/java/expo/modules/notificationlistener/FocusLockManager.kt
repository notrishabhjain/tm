package expo.modules.notificationlistener

import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.graphics.Color
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.io.File
import java.util.Calendar

/**
 * Owns all focus-lock state and the on-screen overlays. Reads pending tasks
 * directly from the SQLite file (same pattern as TaskWidgetProvider) so it works
 * with the app's JS context dead. All persisted state lives in the shared
 * "taskmind_prefs" so both native and (via the module) JS can read/write it.
 */
object FocusLockManager {

    private const val PREFS = "taskmind_prefs"

    // Master toggle: auto-lock when URGENT tasks are pending.
    private const val KEY_ENABLED = "focus_lock_enabled"
    // Manual focus session end (epoch ms). While now < this, lock is active.
    private const val KEY_SESSION_END = "focus_session_end"
    // Timed bypass window end (epoch ms). While now < this, blocking is suspended.
    private const val KEY_BYPASS_UNTIL = "focus_bypass_until"
    // Bypass accounting (resets daily).
    private const val KEY_BYPASS_DATE = "focus_bypass_date"
    private const val KEY_BYPASS_COUNT = "focus_bypass_count"
    // Apps to block (package names). Empty → use preset list.
    private const val KEY_BLOCK_APPS = "focus_block_apps"

    const val MAX_BYPASSES_PER_DAY = 3
    private const val BYPASS_DURATION_MS = 5 * 60 * 1000L
    // Soft nudge → hard block escalation threshold while lingering in a blocked app.
    private const val ESCALATE_MS = 5 * 60 * 1000L

    val PRESET_BLOCK_APPS = setOf(
        "com.google.android.youtube",
        "com.android.chrome",
        "com.instagram.android",
        "com.zhiliaoapp.musically", // TikTok
        "com.reddit.frontpage",
        "com.twitter.android",
        "com.x.android"
    )

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var overlayPkg: String? = null
    private var overlayIsHard = false
    private var enteredBlockedAt = 0L

    // ── State queries ─────────────────────────────────────────────────────────

    fun isLockActive(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now < prefs.getLong(KEY_BYPASS_UNTIL, 0L)) return false
        // Manual session in progress?
        if (now < prefs.getLong(KEY_SESSION_END, 0L)) return true
        // Auto-lock on urgent tasks?
        if (prefs.getBoolean(KEY_ENABLED, false) && countPendingUrgent(context) > 0) return true
        return false
    }

    fun blockedApps(context: Context): Set<String> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val set = prefs.getStringSet(KEY_BLOCK_APPS, null)
        return if (set.isNullOrEmpty()) PRESET_BLOCK_APPS else set
    }

    fun shouldBlock(context: Context, pkg: String): Boolean {
        if (pkg == context.packageName) return false
        if (!blockedApps(context).contains(pkg)) return false
        return isLockActive(context)
    }

    fun bypassesLeftToday(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val today = todayKey()
        val used = if (prefs.getString(KEY_BYPASS_DATE, "") == today) {
            prefs.getInt(KEY_BYPASS_COUNT, 0)
        } else 0
        return (MAX_BYPASSES_PER_DAY - used).coerceAtLeast(0)
    }

    // ── Mutations (also callable from the JS module) ────────────────────────────

    fun startSession(context: Context, durationMinutes: Int) {
        val end = System.currentTimeMillis() + durationMinutes * 60_000L
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(KEY_SESSION_END, end).apply()
    }

    fun endSession(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(KEY_SESSION_END, 0L).apply()
        dismissOverlay()
    }

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ENABLED, enabled).apply()
        if (!enabled) dismissOverlay()
    }

    fun setBlockApps(context: Context, packages: Set<String>) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putStringSet(KEY_BLOCK_APPS, packages).apply()
    }

    /** Grants a timed bypass if the user has any left today. Returns success. */
    fun useBypass(context: Context): Boolean {
        val left = bypassesLeftToday(context)
        if (left <= 0) return false
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val today = todayKey()
        val used = if (prefs.getString(KEY_BYPASS_DATE, "") == today) {
            prefs.getInt(KEY_BYPASS_COUNT, 0)
        } else 0
        prefs.edit()
            .putString(KEY_BYPASS_DATE, today)
            .putInt(KEY_BYPASS_COUNT, used + 1)
            .putLong(KEY_BYPASS_UNTIL, System.currentTimeMillis() + BYPASS_DURATION_MS)
            .apply()
        dismissOverlay()
        return true
    }

    fun hasOverlayPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else true
    }

    // ── Overlay lifecycle (driven by the accessibility service) ─────────────────

    /** Called on every foreground app change with the current package. */
    fun onForegroundApp(context: Context, pkg: String) {
        if (!shouldBlock(context, pkg)) {
            // Left the blocked app (or lock cleared) → tear down.
            if (overlayPkg != null) {
                dismissOverlay()
                enteredBlockedAt = 0L
            }
            return
        }
        val now = System.currentTimeMillis()
        if (overlayPkg == pkg && overlayView != null) {
            // Already nudging this app; escalate if they've lingered past threshold.
            if (!overlayIsHard && enteredBlockedAt > 0 && now - enteredBlockedAt >= ESCALATE_MS) {
                showOverlay(context, pkg, hard = true)
            }
            return
        }
        // First entry into this blocked app.
        enteredBlockedAt = now
        showOverlay(context, pkg, hard = false)
    }

    /** Re-evaluates the current overlay; called periodically by the service. */
    fun tick(context: Context) {
        val pkg = overlayPkg ?: return
        if (!shouldBlock(context, pkg)) {
            dismissOverlay()
            enteredBlockedAt = 0L
            return
        }
        if (!overlayIsHard && enteredBlockedAt > 0 &&
            System.currentTimeMillis() - enteredBlockedAt >= ESCALATE_MS
        ) {
            showOverlay(context, pkg, hard = true)
        }
    }

    @Suppress("DEPRECATION")
    private fun showOverlay(context: Context, pkg: String, hard: Boolean) {
        if (!hasOverlayPermission(context)) return
        // Don't rebuild an identical overlay.
        if (overlayPkg == pkg && overlayIsHard == hard && overlayView != null) return
        dismissOverlay()

        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val view = if (hard) buildHardBlock(context) else buildNudge(context)

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        }
        val flags = if (hard) {
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        } else {
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            if (hard) WindowManager.LayoutParams.MATCH_PARENT
            else WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            flags,
            android.graphics.PixelFormat.TRANSLUCENT
        )
        params.gravity = if (hard) Gravity.CENTER else Gravity.TOP

        try {
            wm.addView(view, params)
            windowManager = wm
            overlayView = view
            overlayPkg = pkg
            overlayIsHard = hard
        } catch (_: Exception) {
            // addView can fail if permission was revoked mid-flight.
        }
    }

    fun dismissOverlay() {
        val wm = windowManager
        val view = overlayView
        if (wm != null && view != null) {
            try {
                wm.removeView(view)
            } catch (_: Exception) {
            }
        }
        overlayView = null
        overlayPkg = null
        overlayIsHard = false
    }

    // ── Overlay views (built in code to avoid RemoteViews/layout coupling) ──────

    private fun dp(context: Context, v: Int): Int =
        (v * context.resources.displayMetrics.density).toInt()

    private fun buildNudge(context: Context): View {
        val tasks = readTopTasks(context, 3)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0A2540"))
            setPadding(dp(context, 16), dp(context, 14), dp(context, 16), dp(context, 14))
        }
        root.addView(TextView(context).apply {
            text = "TaskMind · stay focused"
            setTextColor(Color.WHITE)
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })
        val subtitle = if (tasks.isEmpty()) {
            "You have pending tasks to finish."
        } else {
            tasks.joinToString("  ·  ") { it.title }.take(120)
        }
        root.addView(TextView(context).apply {
            text = subtitle
            setTextColor(Color.parseColor("#C7D3E0"))
            textSize = 12f
            setPadding(0, dp(context, 4), 0, 0)
        })
        // Tap the nudge to open TaskMind.
        root.setOnClickListener { launchApp(context) }
        return root
    }

    private fun buildHardBlock(context: Context): View {
        val tasks = readTopTasks(context, 5)
        val left = bypassesLeftToday(context)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#F20A2540")) // ~95% opaque navy
            setPadding(dp(context, 28), dp(context, 28), dp(context, 28), dp(context, 28))
        }
        root.addView(TextView(context).apply {
            text = "Focus locked"
            setTextColor(Color.WHITE)
            textSize = 26f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
        })
        root.addView(TextView(context).apply {
            text = "Finish a task to unlock this app."
            setTextColor(Color.parseColor("#C7D3E0"))
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(0, dp(context, 8), 0, dp(context, 16))
        })
        if (tasks.isNotEmpty()) {
            val box = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(context, 12), dp(context, 8), dp(context, 12), dp(context, 8))
            }
            for (t in tasks) {
                box.addView(TextView(context).apply {
                    text = "• ${t.title}"
                    setTextColor(Color.WHITE)
                    textSize = 14f
                    setPadding(0, dp(context, 4), 0, dp(context, 4))
                })
            }
            root.addView(box)
        }
        root.addView(Button(context).apply {
            text = "Complete a task"
            setOnClickListener { launchApp(context) }
        })
        root.addView(Button(context).apply {
            text = if (left > 0) "Give me 5 minutes ($left left)" else "No bypasses left today"
            isEnabled = left > 0
            setOnClickListener { useBypass(context) }
        })
        root.addView(Button(context).apply {
            text = "Go to home screen"
            setOnClickListener {
                TaskMindAccessibilityService.goHome()
                dismissOverlay()
            }
        })
        return root
    }

    private fun launchApp(context: Context) {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (_: Exception) {
        }
        dismissOverlay()
    }

    // ── SQLite reads (read-only; same DB path as the widget) ────────────────────

    data class TaskRow(val title: String, val priority: String)

    private fun countPendingUrgent(context: Context): Int {
        val dbPath = File(context.filesDir, "SQLite/taskmind.db").absolutePath
        return try {
            SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery(
                    "SELECT COUNT(*) FROM tasks WHERE status='PENDING' AND needs_confirmation=0 " +
                        "AND deleted_at IS NULL AND priority='URGENT'",
                    null
                ).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }
            }
        } catch (_: SQLiteException) {
            0
        } catch (_: Exception) {
            0
        }
    }

    private fun readTopTasks(context: Context, limit: Int): List<TaskRow> {
        val dbPath = File(context.filesDir, "SQLite/taskmind.db").absolutePath
        return try {
            SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery(
                    """
                    SELECT title, priority FROM tasks
                    WHERE status='PENDING' AND needs_confirmation=0 AND deleted_at IS NULL
                    ORDER BY CASE priority
                        WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                      created_at DESC
                    LIMIT $limit
                    """.trimIndent(),
                    null
                ).use { c ->
                    val out = mutableListOf<TaskRow>()
                    while (c.moveToNext()) {
                        out.add(TaskRow(c.getString(0) ?: "", c.getString(1) ?: "LOW"))
                    }
                    out
                }
            }
        } catch (_: SQLiteException) {
            emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun todayKey(): String {
        val c = Calendar.getInstance()
        return "${c.get(Calendar.YEAR)}-${c.get(Calendar.MONTH)}-${c.get(Calendar.DAY_OF_MONTH)}"
    }
}
