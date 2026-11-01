package com.arupiji.play

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Baca tulisan di dalam gambar (OCR di HP, tanpa internet), terjemahkan, lalu gambar ulang
 * teks terjemahan di atas gambar. File asli disimpan di img_orig.
 */
class ImageStudio(private val store: StudioStore) {

    private val letter = Regex("[A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u3040-\\u30FF\\u3400-\\u9FFF\\uAC00-\\uD7AF]")

    private fun recognizer(script: String): TextRecognizer = when (script) {
        "japanese" -> TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build())
        "chinese" -> TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        "korean" -> TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
        else -> TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }

    private fun relOf(gameDir: File, f: File) = f.relativeTo(gameDir).path.replace('\\', '/')

    private fun backupOf(gameDir: File, rel: String) = File(gameDir, "img_orig/" + rel.removePrefix("img/"))

    private fun sourceOf(gameDir: File, rel: String): File {
        val b = backupOf(gameDir, rel)
        return if (b.exists()) b else File(gameDir, rel)
    }

    private fun decode(f: File): Bitmap? {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(f.path, o)
        if (o.outWidth <= 0 || o.outWidth.toLong() * o.outHeight > 14_000_000L) return null
        val o2 = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
        return BitmapFactory.decodeFile(f.path, o2)
    }

    // ------------------------------------------------------------------ OCR

    fun scan(
        gameId: String, gameDir: File, folders: List<String>, script: String,
        progress: (Int, Int, String) -> Unit
    ): String {
        GameCrypto.decryptAll(gameDir) { progress(0, 0, it) }

        val rels = ArrayList<String>()
        for (fd in folders) {
            File(gameDir, "img/$fd").walkTopDown()
                .filter { it.isFile && it.extension.lowercase() == "png" }
                .forEach { rels.add(relOf(gameDir, it)) }
        }
        if (rels.isEmpty()) return "Tidak ada gambar PNG di folder yang dipilih."

        val rec = recognizer(script)
        var found = 0
        try {
            for ((n, rel) in rels.withIndex()) {
                if (StudioRunner.cancelled()) return "Dibatalkan. $found teks ditemukan."
                progress(n, rels.size, "Membaca ${File(rel).name} (${n + 1}/${rels.size})")
                val bmp = decode(sourceOf(gameDir, rel)) ?: continue
                try {
                    val res = Tasks.await(rec.process(InputImage.fromBitmap(bmp, 0)))
                    val regions = ArrayList<StudioStore.Region>()
                    for (block in res.textBlocks) {
                        for (ln in block.lines) {
                            val box = ln.boundingBox ?: continue
                            val text = ln.text.trim()
                            if (text.length < 2 || !letter.containsMatchIn(text)) continue
                            val r = Rect(
                                max(0, box.left), max(0, box.top),
                                min(bmp.width, box.right), min(bmp.height, box.bottom)
                            )
                            if (r.width() < 6 || r.height() < 6) continue
                            val colors = sampleColors(bmp, r)
                            regions.add(
                                StudioStore.Region(
                                    0, rel, r.left, r.top, r.width(), r.height(),
                                    text, "", false, colors[0], colors[1]
                                )
                            )
                        }
                    }
                    if (regions.isNotEmpty()) found += regions.size
                    store.replaceRegions(gameId, rel, regions)
                } finally {
                    bmp.recycle()
                }
            }
        } finally {
            rec.close()
        }
        return "Selesai. $found teks ditemukan di ${rels.size} gambar."
    }

    private fun lum(c: Int) = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)).toInt()

    /** Hasil: [warna latar, warna teks] */
    private fun sampleColors(bmp: Bitmap, box: Rect): IntArray {
        val l = max(0, box.left - 3)
        val t = max(0, box.top - 3)
        val r = min(bmp.width - 1, box.right + 2)
        val b = min(bmp.height - 1, box.bottom + 2)

        var a = 0L; var rr = 0L; var gg = 0L; var bb = 0L; var cnt = 0L
        fun add(px: Int) {
            a += Color.alpha(px); rr += Color.red(px); gg += Color.green(px); bb += Color.blue(px); cnt++
        }
        for (x in l..r) { add(bmp.getPixel(x, t)); add(bmp.getPixel(x, b)) }
        for (y in t..b) { add(bmp.getPixel(l, y)); add(bmp.getPixel(r, y)) }
        val bg = if (cnt == 0L) Color.BLACK else
            Color.argb((a / cnt).toInt(), (rr / cnt).toInt(), (gg / cnt).toInt(), (bb / cnt).toInt())

        var fr = 0L; var fgc = 0L; var fb = 0L; var fn = 0L
        val step = max(1, box.width() * box.height() / 6000)
        var k = 0
        for (y in box.top until min(bmp.height, box.bottom)) {
            for (x in box.left until min(bmp.width, box.right)) {
                if (k++ % step != 0) continue
                val px = bmp.getPixel(x, y)
                if (Color.alpha(px) < 100) continue
                val d = abs(Color.red(px) - Color.red(bg)) + abs(Color.green(px) - Color.green(bg)) + abs(Color.blue(px) - Color.blue(bg))
                if (d > 200) { fr += Color.red(px); fgc += Color.green(px); fb += Color.blue(px); fn++ }
            }
        }
        val fg = if (fn > 0) Color.rgb((fr / fn).toInt(), (fgc / fn).toInt(), (fb / fn).toInt())
        else if (lum(bg) > 128) Color.BLACK else Color.WHITE
        return intArrayOf(bg, fg)
    }

    // ----------------------------------------------------------- terjemahan

    fun translateRegions(
        gameId: String, ai: AiClient, lang: String, force: Boolean,
        progress: (Int, Int, String) -> Unit
    ): String {
        if (!ai.ready()) throw IllegalStateException("API key, base URL, atau model belum diisi di Pengaturan.")
        val pending = store.pendingRegions(gameId, force)
        if (pending.isEmpty()) return "Tidak ada teks gambar yang perlu diterjemahkan."
        val sys = """You translate text found inside game images (title screens, UI, posters) into $lang.
The user sends a JSON array of short texts. Reply with ONLY a JSON array of the same length and order.
Keep each translation short so it fits the same space. Keep names recognizable. No notes."""
        var done = 0
        for (chunk in pending.chunked(30)) {
            if (StudioRunner.cancelled()) return "Dibatalkan."
            progress(done, pending.size, "Menerjemahkan teks gambar ($done/${pending.size})")
            val items = chunk.map { it.original }
            val out: List<String> = try {
                val s = ai.retry { ai.chat(sys, JSONArray(items).toString()) }
                val a = s.indexOf('[')
                val b = s.lastIndexOf(']')
                val arr = JSONArray(s.substring(a, b + 1))
                if (arr.length() != items.size) throw IllegalStateException("beda jumlah")
                List(arr.length()) { arr.getString(it) }
            } catch (e: java.io.IOException) {
                throw e
            } catch (e: Exception) {
                items.map { t -> ai.retry { ai.chat("Translate into $lang. Reply with the translation only, short.", t) } }
            }
            chunk.forEachIndexed { k, r -> store.setRegionTranslated(r.id, out[k]) }
            done += chunk.size
        }
        return "Selesai menerjemahkan ${pending.size} teks gambar."
    }

    // ----------------------------------------------------------- render ulang

    /** True kalau gambar diubah, false kalau dikembalikan ke asli. */
    fun render(gameId: String, gameDir: File, rel: String): Boolean {
        val regions = store.regions(gameId, rel).filter { it.translated.isNotBlank() && it.translated != it.original }
        val target = File(gameDir, rel)
        val backup = backupOf(gameDir, rel)
        if (!backup.exists() && target.exists()) {
            backup.parentFile?.mkdirs()
            target.copyTo(backup)
        }
        if (regions.isEmpty()) {
            if (backup.exists()) backup.copyTo(target, overwrite = true)
            return false
        }
        val base = BitmapFactory.decodeFile((if (backup.exists()) backup else target).path) ?: return false
        val bmp = base.copy(Bitmap.Config.ARGB_8888, true)
        base.recycle()
        val canvas = Canvas(bmp)
        for (r in regions) drawRegion(canvas, bmp, r)
        target.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bmp.recycle()
        return true
    }

    fun renderAll(gameId: String, gameDir: File, only: String?, progress: (Int, Int, String) -> Unit): String {
        val files = if (only != null) listOf(only) else store.imageFiles(gameId).map { it["file"] as String }
        var changed = 0
        for ((n, rel) in files.withIndex()) {
            if (StudioRunner.cancelled()) break
            progress(n, files.size, "Membuat gambar ${File(rel).name} (${n + 1}/${files.size})")
            if (render(gameId, gameDir, rel)) changed++
        }
        return "Selesai. $changed gambar diperbarui."
    }

    fun revert(gameDir: File) {
        val dir = File(gameDir, "img_orig")
        if (dir.exists()) dir.copyRecursively(File(gameDir, "img"), overwrite = true)
    }

    private fun drawRegion(c: Canvas, bmp: Bitmap, r: StudioStore.Region) {
        val pad = 3f
        val rect = RectF(r.x - pad, r.y - pad, r.x + r.w + pad, r.y + r.h + pad)

        val fill = Paint()
        if (Color.alpha(r.bg) < 40) {
            fill.xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
        } else {
            fill.color = Color.rgb(Color.red(r.bg), Color.green(r.bg), Color.blue(r.bg))
        }
        c.drawRect(rect, fill)

        val text = r.translated
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = r.fg
            textAlign = Paint.Align.CENTER
        }
        val maxW = min(bmp.width - 8f, max(r.w * 1.35f, r.w + 40f))
        var size = r.h * 0.95f
        paint.textSize = size
        while (paint.measureText(text) > maxW && size > 10f) {
            size -= 1f
            paint.textSize = size
        }
        val half = paint.measureText(text) / 2f
        val lo = half + 4f
        val hi = bmp.width - half - 4f
        val cx0 = r.x + r.w / 2f
        val cx = if (lo <= hi) cx0.coerceIn(lo, hi) else bmp.width / 2f
        val fm = paint.fontMetrics
        val cy = r.y + r.h / 2f - (fm.ascent + fm.descent) / 2f

        val stroke = Paint(paint).apply {
            style = Paint.Style.STROKE
            strokeWidth = max(2f, size / 9f)
            color = if (lum(r.fg) > 140) Color.BLACK else Color.WHITE
            strokeJoin = Paint.Join.ROUND
        }
        c.drawText(text, cx, cy, stroke)
        c.drawText(text, cx, cy, paint)
    }
}
