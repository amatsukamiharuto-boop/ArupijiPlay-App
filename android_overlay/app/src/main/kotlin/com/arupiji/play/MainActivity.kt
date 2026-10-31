package com.arupiji.play

import android.content.Intent
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val channelName = "arupiji/native"
    private val reqPickFolder = 4101
    private var pendingImport: MethodChannel.Result? = null
    private val worker = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "importGame" -> startPicker(result)
                    "launchGame" -> {
                        val args = call.arguments as? Map<*, *>
                        if (args == null) result.error("args", "Argumen kosong", null)
                        else {
                            launchGame(args)
                            result.success(true)
                        }
                    }
                    "deleteGame" -> {
                        val path = (call.arguments as? Map<*, *>)?.get("path") as? String
                        if (path != null) File(path).deleteRecursively()
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    // Kalau proses game sempat crash, tampilkan penyebabnya di sini
    override fun onResume() {
        super.onResume()
        val f = File(filesDir, "last_crash.txt")
        if (!f.exists()) return
        val msg = try { f.readText() } catch (_: Throwable) { "" }
        f.delete()
        if (msg.isNotBlank()) ErrorDialog.show(this, "Game berhenti karena error", msg)
    }

    private fun startPicker(result: MethodChannel.Result) {
        if (pendingImport != null) {
            result.error("busy", "Import lain sedang berjalan", null)
            return
        }
        pendingImport = result
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
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
                ui.post { result.error("import_failed", e.message ?: "Import gagal", null) }
            }
        }
    }

    private fun launchGame(a: Map<*, *>) {
        val i = Intent(this, GameActivity::class.java).apply {
            putExtra("id", a["id"] as? String ?: "")
            putExtra("title", a["title"] as? String ?: "")
            putExtra("path", a["path"] as? String ?: "")
            putExtra("apiKey", a["apiKey"] as? String ?: "")
            putExtra("baseUrl", a["baseUrl"] as? String ?: "")
            putExtra("model", a["model"] as? String ?: "")
            putExtra("lang", a["lang"] as? String ?: "Indonesian")
            putExtra("glossary", a["glossary"] as? String ?: "")
            putExtra("translate", a["translate"] as? Boolean ?: false)
            putExtra("gamepad", a["gamepad"] as? Boolean ?: true)
            putExtra("opacity", (a["opacity"] as? Double ?: 0.55).toFloat())
        }
        startActivity(i)
    }
}
