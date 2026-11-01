package com.arupiji.play

import android.content.Intent
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val reqPickFolder = 4101
    private var pendingImport: MethodChannel.Result? = null
    private val worker = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        MethodChannel(messenger, "arupiji/native").setMethodCallHandler { call, result -> handleNative(call, result) }
        MethodChannel(messenger, "arupiji/studio").setMethodCallHandler { call, result -> handleStudio(call, result) }
    }

    // ------------------------------------------------------------ util argumen

    private fun Map<*, *>.s(k: String): String = (this[k] as? String) ?: ""
    private fun Map<*, *>.i(k: String, d: Int = 0): Int = (this[k] as? Number)?.toInt() ?: d
    private fun Map<*, *>.b(k: String): Boolean = (this[k] as? Boolean) ?: false
    private fun Map<*, *>.l(k: String): List<String> = (this[k] as? List<*>)?.map { it.toString() } ?: emptyList()

    private fun <T> background(result: MethodChannel.Result, block: () -> T) {
        worker.execute {
            try {
                val r = block()
                ui.post { result.success(r) }
            } catch (e: Throwable) {
                DebugLog.add(applicationContext, "E", "Native", e.stackTraceToString())
                ui.post { result.error("failed", e.message ?: e.toString(), null) }
            }
        }
    }

    // ----------------------------------------------------------- channel native

    private fun handleNative(call: MethodCall, result: MethodChannel.Result) {
        val a = (call.arguments as? Map<*, *>) ?: emptyMap<String, Any?>()
        when (call.method) {
            "importGame" -> startPicker(result)
            "launchGame" -> {
                launchGame(a)
                result.success(true)
            }
            "deleteGame" -> {
                val path = a.s("path")
                if (path.isNotEmpty()) File(path).deleteRecursively()
                result.success(true)
            }
            "debugLog" -> {
                DebugLog.add(applicationContext, a.s("level"), a.s("tag"), a.s("msg"))
                result.success(true)
            }
            "debugRead" -> result.success(DebugLog.read(applicationContext))
            "debugClear" -> {
                DebugLog.clear(applicationContext)
                result.success(true)
            }
            else -> result.notImplemented()
        }
    }

    private fun startPicker(result: MethodChannel.Result) {
        if (pendingImport != null) {
            result.error("busy", "Import lain sedang berjalan", null)
            return
        }
        pendingImport = result
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivityForResult(i, reqPickFolder)
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != reqPickFolder) return
        val result = pendingImport ?: return
        pendingImport = null
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) {
            result.success(null)
            return
        }
        worker.execute {
            try {
                val meta = GameImporter(applicationContext).import(uri)
                ui.post { result.success(meta) }
            } catch (e: Exception) {
                DebugLog.add(applicationContext, "E", "Import", e.stackTraceToString())
                ui.post { result.error("import_failed", e.message ?: "Import gagal", null) }
            }
        }
    }

    private fun launchGame(a: Map<*, *>) {
        val i = Intent(this, GameActivity::class.java).apply {
            putExtra("id", a.s("id"))
            putExtra("title", a.s("title"))
            putExtra("path", a.s("path"))
            putExtra("apiKey", a.s("apiKey"))
            putExtra("baseUrl", a.s("baseUrl"))
            putExtra("model", a.s("model"))
            putExtra("lang", a.s("lang").ifEmpty { "Indonesian" })
            putExtra("glossary", a.s("glossary"))
            putExtra("translate", a.b("translate"))
            putExtra("gamepad", (a["gamepad"] as? Boolean) ?: true)
            putExtra("debug", a.b("debug"))
            putExtra("opacity", ((a["opacity"] as? Number)?.toFloat()) ?: 0.55f)
        }
        startActivity(i)
    }

    // ----------------------------------------------------------- channel studio

    private fun handleStudio(call: MethodCall, result: MethodChannel.Result) {
        val a = (call.arguments as? Map<*, *>) ?: emptyMap<String, Any?>()
        val ctx = applicationContext
        val store = StudioStore.get(ctx)
        val gid = a.s("gameId")
        val dir = File(a.s("path"))

        fun run(name: String, block: ((Int, Int, String) -> Unit) -> String) {
            try {
                StudioRunner.start(ctx, name, block)
                result.success(true)
            } catch (e: IllegalStateException) {
                result.error("busy", e.message, null)
            }
        }

        when (call.method) {
            "status" -> result.success(StudioRunner.status())
            "cancel" -> {
                StudioRunner.cancel = true
                result.success(true)
            }
            "startExtract" -> run("Ekstrak teks") { p ->
                val n = TextStudio(store).extract(gid, dir) { m -> p(0, 0, m) }
                "Selesai. $n teks ditemukan."
            }
            "startTranslate" -> {
                val ai = AiClient(a.s("apiKey"), a.s("baseUrl"), a.s("model"))
                val lang = a.s("lang").ifEmpty { "Indonesian" }
                val force = a.b("force")
                run("Terjemahkan") { p ->
                    val m1 = TextStudio(store).translateAll(gid, ai, lang, a.s("glossary"), force, p)
                    val m2 = ImageStudio(store).translateRegions(gid, ai, lang, force, p)
                    "$m1 $m2"
                }
            }
            "startApplyText" -> run("Terapkan teks") { p ->
                val n = TextStudio(store).apply(gid, dir, a.i("wrapPlain", 46), a.i("wrapFace", 38)) { m -> p(0, 0, m) }
                "Selesai. $n file data ditulis. Buka ulang game untuk melihat hasilnya."
            }
            "startApplyImages" -> run("Terapkan gambar") { p ->
                val only = a.s("only").ifEmpty { null }
                ImageStudio(store).renderAll(gid, dir, only, p)
            }
            "startRevert" -> run("Kembalikan asli") { _ ->
                TextStudio(store).revert(dir)
                ImageStudio(store).revert(dir)
                "Semua file dikembalikan ke versi asli."
            }
            "startScan" -> run("Pindai gambar") { p ->
                ImageStudio(store).scan(gid, dir, a.l("folders"), a.s("script").ifEmpty { "latin" }, p)
            }
            "list" -> background(result) {
                store.list(gid, a.l("kinds"), a.s("query"), a.i("offset"), a.i("limit", 40))
            }
            "counts" -> background(result) { store.counts(gid) }
            "update" -> background(result) {
                store.setTranslated((a["id"] as Number).toLong(), a.s("text"), true)
                true
            }
            "imageFiles" -> background(result) { store.imageFiles(gid) }
            "regions" -> background(result) {
                store.regions(gid, a.s("file")).map {
                    mapOf(
                        "id" to it.id, "x" to it.x, "y" to it.y, "w" to it.w, "h" to it.h,
                        "original" to it.original, "translated" to it.translated, "edited" to it.edited
                    )
                }
            }
            "updateRegion" -> background(result) {
                store.updateRegion((a["id"] as Number).toLong(), a.s("text"))
                true
            }
            "imagePath" -> {
                val rel = a.s("file")
                val orig = File(dir, "img_orig/" + rel.removePrefix("img/"))
                val f = if (a.b("original") && orig.exists()) orig else File(dir, rel)
                result.success(f.absolutePath)
            }
            else -> result.notImplemented()
        }
    }

    // Kalau proses game sempat crash, tampilkan penyebabnya di sini
    override fun onResume() {
        super.onResume()
        val f = File(filesDir, "last_crash.txt")
        if (!f.exists()) return
        val msg = try { f.readText() } catch (_: Throwable) { "" }
        f.delete()
        if (msg.isNotBlank()) {
            DebugLog.add(applicationContext, "E", "Crash", msg)
            ErrorDialog.show(this, "Game berhenti karena error", msg)
        }
    }
}
