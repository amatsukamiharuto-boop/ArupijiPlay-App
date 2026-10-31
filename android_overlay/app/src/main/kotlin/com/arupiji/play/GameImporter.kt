package com.arupiji.play

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Menyalin folder game dari SAF ke filesDir/games/<id>/ supaya bisa dibuka lewat file://
 * oleh WebView. Yang disalin hanya folder web-nya (yang punya index.html).
 */
class GameImporter(private val ctx: Context) {

    private data class Child(val docId: String, val name: String, val isDir: Boolean)

    private fun children(tree: Uri, parentDocId: String): List<Child> {
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentDocId)
        val cols = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        val out = ArrayList<Child>()
        ctx.contentResolver.query(uri, cols, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                out.add(Child(c.getString(0), c.getString(1) ?: "", c.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR))
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

    private fun copyDir(tree: Uri, docId: String, dest: File) {
        dest.mkdirs()
        for (k in children(tree, docId)) {
            if (k.name.isEmpty() || k.name.contains("..")) continue
            val target = File(dest, k.name)
            if (k.isDir) {
                copyDir(tree, k.docId, target)
            } else {
                val src = DocumentsContract.buildDocumentUriUsingTree(tree, k.docId)
                ctx.contentResolver.openInputStream(src)?.use { input ->
                    target.outputStream().use { out -> input.copyTo(out, 64 * 1024) }
                }
            }
        }
    }

    fun import(tree: Uri): Map<String, Any?> {
        val rootId = DocumentsContract.getTreeDocumentId(tree)
        val webRootId = findWebRoot(tree, rootId, 0)
            ?: throw IllegalStateException("index.html tidak ditemukan. Pilih folder game yang berisi index.html atau www/index.html.")

        // game.json opsional, kalau ada dipakai untuk judul/cover
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
            copyDir(tree, webRootId, dest)
        } catch (e: Exception) {
            dest.deleteRecursively()
            throw e
        }

        val engine = when {
            File(dest, "js/rmmz_core.js").exists() -> "RPG Maker MZ"
            File(dest, "js/rpg_core.js").exists() -> "RPG Maker MV"
            else -> "HTML5"
        }

        var title = customTitle
        if (title == null) {
            try {
                val sys = File(dest, "data/System.json")
                if (sys.exists()) title = JSONObject(sys.readText()).optString("gameTitle").ifBlank { null }
            } catch (_: Exception) {
            }
        }
        if (title == null) {
            title = DocumentsContract.getTreeDocumentId(tree).substringAfterLast('/').substringAfterLast(':').ifBlank { "Game Baru" }
        }

        val cover = findCover(dest, customCover)

        return mapOf(
            "id" to id,
            "title" to title,
            "engine" to engine,
            "path" to dest.absolutePath,
            "cover" to cover
        )
    }

    private fun findCover(dest: File, custom: String?): String? {
        if (custom != null) {
            val f = File(dest, custom)
            if (f.exists()) return f.absolutePath
        }
        val exts = setOf("png", "jpg", "jpeg", "webp")
        File(dest, "img/titles1").listFiles()
            ?.filter { it.extension.lowercase() in exts }
            ?.minByOrNull { it.name }
            ?.let { return it.absolutePath }
        listOf("icon/icon.png", "icon.png", "cover.png", "cover.jpg").forEach {
            val f = File(dest, it)
            if (f.exists()) return f.absolutePath
        }
        return null
    }
}
