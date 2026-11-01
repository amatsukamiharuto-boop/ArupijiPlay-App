package com.arupiji.play

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Log sederhana ke file. Format per baris: jam|level|tag|pesan (newline diganti \u0001). */
object DebugLog {
    private const val MAX_BYTES = 300_000L

    @Synchronized
    fun add(ctx: Context, level: String, tag: String, msg: String) {
        try {
            val f = File(ctx.filesDir, "debug.log")
            if (f.exists() && f.length() > MAX_BYTES) {
                val keep = f.readText().takeLast((MAX_BYTES / 2).toInt())
                f.writeText(keep.substringAfter('\n', keep))
            }
            val ts = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
            val clean = msg.replace("\r", "").replace("\n", "\u0001")
            f.appendText("$ts|$level|$tag|$clean\n")
        } catch (_: Throwable) {
        }
    }

    fun read(ctx: Context): String = try {
        val f = File(ctx.filesDir, "debug.log")
        if (f.exists()) f.readText() else ""
    } catch (_: Throwable) {
        ""
    }

    fun clear(ctx: Context) {
        try {
            File(ctx.filesDir, "debug.log").delete()
        } catch (_: Throwable) {
        }
    }
}
