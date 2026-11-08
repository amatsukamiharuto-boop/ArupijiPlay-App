package com.arupiji.play

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.CancellationException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/** Status impor yang dibaca Flutter lewat polling. */
object ImportState {
    @Volatile var running = false
    @Volatile var phase = ""
    @Volatile var cancel = false
    @Volatile var totalBytes = 0L
    @Volatile var totalFiles = 0
    @Volatile var current = ""
    val doneBytes = AtomicLong(0)
    val doneFiles = AtomicInteger(0)

    fun reset() {
        running = true
        phase = "Membaca daftar file..."
        cancel = false
        totalBytes = 0
        totalFiles = 0
        current = ""
        doneBytes.set(0)
        doneFiles.set(0)
    }

    fun status(): Map<String, Any?> = mapOf(
        "running" to running, "phase" to phase,
        "doneBytes" to doneBytes.get(), "totalBytes" to totalBytes,
        "doneFiles" to doneFiles.get(), "totalFiles" to totalFiles, "current" to current
    )
}

/**
 * Dua cara menambah game:
 * 1. import(): salin folder dari SAF ke filesDir/games/<id>/ (aman, tapi lama untuk game besar).
 * 2. importLinked(): langsung pakai folder aslinya (cepat, butuh izin Akses semua file).
 */
class GameImporter(private val ctx: Context) {

    companion object {
        fun hasAllFilesAccess(ctx: Context): Boolean =
            if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
            else ctx.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

    private data class Child(val docId: String, val name: String, val isDir: Boolean, val size: Long)
    private class Job(val docId: String, val dest: File, val size: Long)

    private fun children(tree: Uri, parentDocId: String): List<Child> {
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentDocId)
        val cols = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
        )
        val out = ArrayList<Child>()
        ctx.contentResolver.query(uri, cols, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                out.add(
                    Child(
                        c.getString(0), c.getString(1) ?: "",
                        c.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR, c.getLong(3)
                    )
                )
            }
        }
        return out
    }

    private fun findWebRoot(tree: Uri, docId: String, depth: Int): String? {
        val kids = children(tree, docId)
        if (kids.any { !it.isDir && it.name.equals("index.html", true) }) return docId
        if (depth >= 2) return null
        kids.firstOrNull { it.isDir && it.name.equals("www", true) }
            ?.let { w -> findWebRoot(tree, w.docId, depth + 1)?.let { return it } }
        for (k in kids.filter { it.isDir }) {
            findWebRoot(tree, k.docId, depth + 1)?.let { return it }
        }
        return null
    }

    private fun collect(tree: Uri, docId: String, dest: File, out: MutableList<Job>) {
        if (ImportState.cancel) throw CancellationException("Dibatalkan")
        dest.mkdirs()
        for (k in children(tree, docId)) {
            if (k.name.isEmpty() || k.name.contains("..")) continue
            val target = File(dest, k.name)
            if (k.isDir) collect(tree, k.docId, target, out) else out.add(Job(k.docId, target, k.size))
        }
    }

    private fun copyOne(tree: Uri, j: Job) {
        if (ImportState.cancel) throw CancellationException("Dibatalkan")
        val src = DocumentsContract.buildDocumentUriUsingTree(tree, j.docId)
        ctx.contentResolver.openInputStream(src)?.use { input ->
            j.dest.outputStream().use { out ->
                val buf = ByteArray(512 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    ImportState.doneBytes.addAndGet(n.toLong())
                    if (ImportState.cancel) throw CancellationException("Dibatalkan")
                }
            }
        }
        ImportState.current = j.dest.name
        ImportState.doneFiles.incrementAndGet()
    }

    /** Nama folder yang dipilih, melewati nama umum seperti "www". */
    private fun folderName(treeId: String): String {
        val parts = treeId.substringAfter(':', treeId).split('/').filter { it.isNotBlank() }
        val generic = setOf("www", "game", "app", "project", "data", "files")
        return parts.lastOrNull { it.lowercase() !in generic } ?: parts.lastOrNull() ?: "Game Baru"
    }

    // ---------------------------------------------------------------- salin

    fun import(tree: Uri): Map<String, Any?> {
        ImportState.reset()
        try {
            return doImport(tree)
        } finally {
            ImportState.running = false
        }
    }

    private fun doImport(tree: Uri): Map<String, Any?> {
        val rootId = DocumentsContract.getTreeDocumentId(tree)
        val webRootId = findWebRoot(tree, rootId, 0)
            ?: throw IllegalStateException("index.html tidak ditemukan. Pilih folder game yang berisi index.html atau www/index.html.")

        var customTitle: String? = null
        var customCover: String? = null
        children(tree, rootId).firstOrNull { !it.isDir && it.name.equals("game.json", true) }?.let { gj ->
            try {
                val uri = DocumentsContract.buildDocumentUriUsingTree(tree, gj.docId)
                val txt = ctx.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                if (txt != null) {
                    val j = JSONObject(txt)
                    customTitle = j.optString("title").ifBlank { null }
                    customCover = j.optString("cover").ifBlank { null }
                }
            } catch (_: Exception) {
            }
        }

        val id = UUID.randomUUID().toString()
        val dest = File(ctx.filesDir, "games/$id")
        try {
            val jobs = ArrayList<Job>()
            collect(tree, webRootId, dest, jobs)

            val total = jobs.sumOf { it.size }
            ImportState.totalBytes = total
            ImportState.totalFiles = jobs.size
            val free = ctx.filesDir.usableSpace
            if (total + 64L * 1024 * 1024 > free) {
                throw IllegalStateException(
                    "Ruang penyimpanan tidak cukup. Butuh sekitar ${total / 1048576} MB, tersisa ${free / 1048576} MB. " +
                        "Kosongkan ruang atau pakai mode Tanpa salin."
                )
            }

            ImportState.phase = "Menyalin file game..."
            val pool = Executors.newFixedThreadPool(3)
            try {
                val futures = jobs.map { j -> pool.submit<Unit> { copyOne(tree, j) } }
                futures.forEach { it.get() }
            } catch (e: ExecutionException) {
                pool.shutdownNow()
                throw (e.cause ?: e)
            } finally {
                pool.shutdown()
            }
        } catch (e: Throwable) {
            dest.deleteRecursively()
            throw e
        }

        ImportState.phase = "Menyiapkan data game..."
        return describe(dest, id, customTitle, customCover, folderName(rootId), false)
    }

    // ----------------------------------------------------------- tanpa salin

    private fun treeToFile(tree: Uri): File? {
        val id = DocumentsContract.getTreeDocumentId(tree)
        val vol = id.substringBefore(':')
        val rel = id.substringAfter(':', "")
        val base = if (vol == "primary") Environment.getExternalStorageDirectory() else File("/storage/$vol")
        val f = if (rel.isEmpty()) base else File(base, rel)
        return if (f.exists()) f else null
    }

    private fun findWebRootFile(dir: File, depth: Int): File? {
        if (File(dir, "index.html").exists()) return dir
        if (depth >= 2) return null
        val kids = dir.listFiles()?.filter { it.isDirectory } ?: return null
        kids.firstOrNull { it.name.equals("www", true) }?.let { w -> findWebRootFile(w, depth + 1)?.let { return it } }
        for (k in kids) findWebRootFile(k, depth + 1)?.let { return it }
        return null
    }

    fun importLinked(tree: Uri): Map<String, Any?> {
        if (!hasAllFilesAccess(ctx)) {
            throw IllegalStateException("Izin Akses semua file belum diberikan. Berikan izinnya di pengaturan lalu coba lagi.")
        }
        val base = treeToFile(tree)
            ?: throw IllegalStateException("Folder ini tidak bisa dibuka langsung (bukan penyimpanan HP atau kartu SD). Pakai mode Salin ke app.")
        val web = findWebRootFile(base, 0)
            ?: throw IllegalStateException("index.html tidak ditemukan. Pilih folder game yang berisi index.html atau www/index.html.")
        val id = UUID.randomUUID().toString()
        return describe(web, id, null, null, folderName(DocumentsContract.getTreeDocumentId(tree)), true)
    }

    // --------------------------------------------------------------- metadata

    private fun describe(
        dir: File, id: String, customTitle: String?, customCover: String?, fallbackName: String, linked: Boolean
    ): Map<String, Any?> {
        val engine = when {
            File(dir, "js/rmmz_core.js").exists() -> "RPG Maker MZ"
            File(dir, "js/rpg_core.js").exists() -> "RPG Maker MV"
            else -> "HTML5"
        }
        val title = customTitle ?: readSystemTitle(dir) ?: readHtmlTitle(dir) ?: fallbackName
        return mapOf(
            "id" to id,
            "title" to title,
            "engine" to engine,
            "path" to dir.absolutePath,
            "cover" to findCover(dir, id, customCover),
            "linked" to linked
        )
    }

    private fun readSystemTitle(dest: File): String? = try {
        val sys = File(dest, "data/System.json")
        if (sys.exists()) JSONObject(sys.readText().removePrefix("\uFEFF")).optString("gameTitle").trim().ifBlank { null } else null
    } catch (_: Exception) {
        null
    }

    private fun readHtmlTitle(dest: File): String? = try {
        val html = File(dest, "index.html").readText()
        Regex("<title>([^<]*)</title>", RegexOption.IGNORE_CASE).find(html)?.groupValues?.get(1)?.trim()?.ifBlank { null }
    } catch (_: Exception) {
        null
    }

    private val plainExt = setOf("png", "jpg", "jpeg", "webp")
    private val encExt = setOf("rpgmvp", "png_")

    /** Cover: gambar judul game. Kalau terenkripsi, hanya file itu yang didekripsi ke cache. */
    private fun resolveCover(gameDir: File, id: String, f: File): String? {
        val ext = f.extension.lowercase()
        if (ext in plainExt) return f.absolutePath
        if (ext in encExt) {
            val dst = File(ctx.filesDir, "covers/$id.png")
            if (GameCrypto.decryptToFile(gameDir, f, dst)) return dst.absolutePath
        }
        return null
    }

    private fun findCover(dest: File, id: String, custom: String?): String? {
        if (custom != null) {
            val f = File(dest, custom)
            if (f.exists()) resolveCover(dest, id, f)?.let { return it }
        }
        try {
            val sys = JSONObject(File(dest, "data/System.json").readText().removePrefix("\uFEFF"))
            val n = sys.optString("title1Name")
            if (n.isNotBlank()) {
                for (e in plainExt + encExt) {
                    val f = File(dest, "img/titles1/$n.$e")
                    if (f.exists()) resolveCover(dest, id, f)?.let { return it }
                }
            }
        } catch (_: Exception) {
        }
        for (dir in listOf("img/titles1", "img/titles2")) {
            val first = File(dest, dir).listFiles()
                ?.filter { it.extension.lowercase() in plainExt || it.extension.lowercase() in encExt }
                ?.minByOrNull { it.name }
            if (first != null) resolveCover(dest, id, first)?.let { return it }
        }
        return null
    }
}
