package com.arupiji.play

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.SpannableString
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.util.TypedValue
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/** Kotak error berlatar putih, baris error berwarna merah supaya mudah dibaca. */
object ErrorDialog {
    private val RED = Color.parseColor("#D50000")
    private val DARK_RED = Color.parseColor("#8E0000")
    private val GRAY = Color.parseColor("#455A64")

    private fun paint(sb: SpannableStringBuilder, start: Int, end: Int, color: Int, bold: Boolean) {
        sb.setSpan(ForegroundColorSpan(color), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (bold) sb.setSpan(StyleSpan(Typeface.BOLD), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    fun render(trace: String): CharSequence {
        val sb = SpannableStringBuilder()
        trace.lines().forEachIndexed { i, line ->
            val start = sb.length
            sb.append(line).append('\n')
            val end = sb.length
            when {
                i == 0 || line.startsWith("Caused by") -> paint(sb, start, end, RED, true)
                line.contains("com.arupiji") -> paint(sb, start, end, DARK_RED, true)
                else -> paint(sb, start, end, GRAY, false)
            }
        }
        return sb
    }

    fun show(activity: Activity, title: String, trace: String, onClose: (() -> Unit)? = null) {
        if (activity.isFinishing) return

        val tv = TextView(activity).apply {
            text = render(trace)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            typeface = Typeface.MONOSPACE
            setPadding(40, 24, 40, 24)
            setTextColor(GRAY)
            setTextIsSelectable(true)
        }
        val sv = ScrollView(activity).apply {
            setBackgroundColor(Color.WHITE)
            addView(tv)
        }
        val titleSpan = SpannableString(title).apply {
            setSpan(ForegroundColorSpan(RED), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(StyleSpan(Typeface.BOLD), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }

        val dlg = AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle(titleSpan)
            .setView(sv)
            .setPositiveButton("Tutup") { _, _ -> onClose?.invoke() }
            .setNeutralButton("Salin", null)
            .setCancelable(false)
            .create()
        dlg.show()
        // dipasang setelah show() supaya dialog tidak menutup saat Salin ditekan
        dlg.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
            val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("error", trace))
            Toast.makeText(activity, "Error disalin", Toast.LENGTH_SHORT).show()
        }
    }
}
