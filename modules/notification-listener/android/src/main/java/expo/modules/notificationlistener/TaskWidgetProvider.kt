package expo.modules.notificationlistener

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import java.io.File

data class WidgetTask(val title: String, val priority: String)

data class WidgetData(val tasks: List<WidgetTask>, val totalPending: Int)

class TaskWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val data = readPendingTasks(context)
        for (widgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId, data)
        }
    }

    override fun onEnabled(context: Context) {
        triggerUpdate(context)
    }

    companion object {
        fun triggerUpdate(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, TaskWidgetProvider::class.java)
            )
            if (ids.isEmpty()) return
            val data = readPendingTasks(context)
            for (id in ids) {
                updateWidget(context, manager, id, data)
            }
        }

        private fun priorityColor(priority: String): Int = when (priority) {
            "URGENT" -> Color.parseColor("#D62828")
            "HIGH"   -> Color.parseColor("#E76F00")
            "MEDIUM" -> Color.parseColor("#2E5B8E")
            else     -> Color.parseColor("#6B7785")
        }

        fun updateWidget(
            context: Context,
            manager: AppWidgetManager,
            widgetId: Int,
            data: WidgetData
        ) {
            val pkg = context.packageName
            val tasks = data.tasks

            val views = RemoteViews(pkg, R.layout.task_widget)

            // Tap entire widget → open app
            val launchIntent = context.packageManager.getLaunchIntentForPackage(pkg)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            // Count badge — total pending, not just the rows shown
            val count = data.totalPending
            views.setTextViewText(R.id.widget_count_badge, "$count pending")

            // Task rows
            data class RowIds(val row: Int, val text: Int, val dot: Int)
            val rowIds = listOf(
                RowIds(R.id.widget_task_row_1, R.id.widget_task_text_1, R.id.widget_task_dot_1),
                RowIds(R.id.widget_task_row_2, R.id.widget_task_text_2, R.id.widget_task_dot_2),
                RowIds(R.id.widget_task_row_3, R.id.widget_task_text_3, R.id.widget_task_dot_3),
            )

            for ((index, ids) in rowIds.withIndex()) {
                val task = tasks.getOrNull(index)
                if (task != null) {
                    views.setViewVisibility(ids.row, View.VISIBLE)
                    views.setTextViewText(ids.text, task.title)
                    views.setInt(ids.dot, "setBackgroundColor", priorityColor(task.priority))
                } else {
                    views.setViewVisibility(ids.row, View.GONE)
                }
            }

            // Empty state
            views.setViewVisibility(
                R.id.widget_empty,
                if (tasks.isEmpty()) View.VISIBLE else View.GONE
            )

            // Footer with overflow hint
            val footerText = when {
                count > tasks.size -> "+${count - tasks.size} more · tap to open"
                else -> "Tap to open TaskMind"
            }
            views.setTextViewText(R.id.widget_footer, footerText)

            manager.updateAppWidget(widgetId, views)
        }

        fun readPendingTasks(context: Context): WidgetData {
            // expo-sqlite v15 stores databases in filesDir/SQLite/, not the standard databases/ dir
            val dbPath = File(context.filesDir, "SQLite/taskmind.db").absolutePath
            return try {
                SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                    val whereClause = """
                        WHERE status = 'PENDING'
                          AND needs_confirmation = 0
                          AND deleted_at IS NULL
                    """.trimIndent()

                    var total = 0
                    db.rawQuery("SELECT COUNT(*) FROM tasks $whereClause", null).use {
                        if (it.moveToFirst()) total = it.getInt(0)
                    }

                    val cursor = db.rawQuery(
                        """
                        SELECT title, priority FROM tasks
                        $whereClause
                        ORDER BY
                          CASE priority
                            WHEN 'URGENT' THEN 0
                            WHEN 'HIGH'   THEN 1
                            WHEN 'MEDIUM' THEN 2
                            ELSE 3
                          END,
                          created_at DESC
                        LIMIT 3
                        """.trimIndent(),
                        null
                    )
                    val result = mutableListOf<WidgetTask>()
                    cursor.use {
                        while (it.moveToNext()) {
                            result.add(
                                WidgetTask(
                                    title = it.getString(0) ?: "",
                                    priority = it.getString(1) ?: "LOW"
                                )
                            )
                        }
                    }
                    WidgetData(result, total)
                }
            } catch (_: SQLiteException) {
                WidgetData(emptyList(), 0)
            } catch (_: Exception) {
                WidgetData(emptyList(), 0)
            }
        }
    }
}
