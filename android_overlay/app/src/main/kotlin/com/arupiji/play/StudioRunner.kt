package com.arupiji.play

import android.content.Context
import android.util.Log

/** Satu pekerjaan Studio berjalan di satu waktu. Status dibaca Flutter lewat polling. */
object StudioRunner {
    @Volatile var running = false
    @Volatile var task = ""
    @Volatile var done = 0
    @Volatile var total = 0
    @Volatile var message = ""
    @Volatile var error: String? = null
    @Volatile var cancel = false
    @Volatile var finishedAt = 0L

    fun status(): Map<String, Any?> = mapOf(
        "running" to running,
        "task" to task,
        "done" to done,
        "total" to total,
        "message" to message,
        "error" to error,
        "finishedAt" to finishedAt
    )

    fun cancelled(): Boolean = cancel

    fun start(ctx: Context, name: String, block: ((Int, Int, String) -> Unit) -> String) {
        if (running) throw IllegalStateException("Proses lain masih berjalan: $task")
        running = true
        task = name
        done = 0
        total = 0
        message = "Mulai..."
        error = null
        cancel = false

        val progress: (Int, Int, String) -> Unit = { d, t, m ->
            done = d
            total = t
            message = m
        }
        Thread {
            try {
                message = block(progress)
            } catch (e: Throwable) {
                error = e.message ?: e.toString()
                DebugLog.add(ctx, "E", "Studio", Log.getStackTraceString(e))
            } finally {
                running = false
                finishedAt = System.currentTimeMillis()
            }
        }.start()
    }
}
