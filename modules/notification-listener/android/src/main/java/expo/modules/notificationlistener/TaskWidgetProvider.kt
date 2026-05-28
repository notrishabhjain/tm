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
import com.taskmind.app.R

data class WidgetTask(val title: String, val priority: String)

class TaskWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val tasks = readPendingTasks(context)
        for (widgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId, tasks)
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
            val tasks = readPendingTasks(context)
            for (id in ids) {
                updateWidget(context, manager, id, tasks)
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
            tasks: List<WidgetTask>
        ) {
            val views = RemoteViews(context.packageName, R.layout.task_widget)

            // Tap entire widget → open app
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(android.R.id.content, pendingIntent)

            // Count badge
            val count = tasks.size
            views.setTextViewText(R.id.widget_count_badge, "$count pending")

            // Task rows
            val rowIds = listOf(
                Triple(R.id.widget_task_row_1, R.id.widget_task_text_1, R.id.widget_task_dot_1),
                Triple(R.id.widget_task_row_2, R.id.widget_task_text_2, R.id.widget_task_dot_2),
                Triple(R.id.widget_task_row_3, R.id.widget_task_text_3, R.id.widget_task_dot_3),
            )

            for ((index, ids) in rowIds.withIndex()) {
                val (rowId, textId, dotId) = ids
                val task = tasks.getOrNull(index)
                if (task != null) {
                    views.setViewVisibility(rowId, View.VISIBLE)
                    views.setTextViewText(textId, task.title)
                    views.setInt(dotId, "setBackgroundColor", priorityColor(task.priority))
                } else {
                    views.setViewVisibility(rowId, View.GONE)
                }
            }

            // Empty state
            views.setViewVisibility(R.id.widget_empty, if (tasks.isEmpty()) View.VISIBLE else View.GONE)

            // Footer with overflow hint
            val footerText = when {
                count > 3 -> "+${count - 3} more · tap to open"
                else -> "Tap to open TaskMind"
            }
            views.setTextViewText(R.id.widget_footer, footerText)

            manager.updateAppWidget(widgetId, views)
        }

        fun readPendingTasks(context: Context): List<WidgetTask> {
            val dbPath = context.getDatabasePath("tm.db").absolutePath
            return try {
                SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                    val cursor = db.rawQuery(
                        """
                        SELECT title, priority FROM tasks
                        WHERE status = 'PENDING'
                          AND needs_confirmation = 0
                          AND deleted_at IS NULL
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
                    result
                }
            } catch (_: SQLiteException) {
                emptyList()
            } catch (_: Exception) {
                emptyList()
            }
        }
    }
}
