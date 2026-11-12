package com.arupiji.play

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Bundle
import android.os.Process
import android.system.Os
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

class GameActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var gp: SharedPreferences
    private lateinit var translator: Translator
    private lateinit var injectJs: String
    private val io = Executors.newFixedThreadPool(2)

    private var gameId = ""
    private var gameTitle = ""
    private var defTranslate = false
    private var defGamepad = true
    private var defOpacity = 0.55f
    private var defCursor = false
    private var defCursorSpeed = 1.6f
    private var defCheat = true
    private var defFps = false
    private var defBtnScale = 1f
    private var appLang = "id"
    private var hasKey = false
    private var debug = false
    private var gamePath = ""
    private var audioExt = ""
    private var lang = "Indonesian"

    override fun onCreate(savedInstanceState: Bundle?) {
        installCrashLogger()
        gameId = intent.getStringExtra("id") ?: "default"
        // Suffix ini harus diset sebelum WebView pertama dibuat. Efeknya localStorage
        // (save RPG Maker) terpisah per game. Hanya jalan di Android 9 ke atas.
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                WebView.setDataDirectorySuffix("g" + gameId.replace("-", "").take(20))
            } catch (_: Throwable) {
            }
        }
        super.onCreate(savedInstanceState)
        try {
            initGame()
        } catch (e: Throwable) {
            showFatal(e)
        }
    }

    private fun installCrashLogger() {
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val trace = Log.getStackTraceString(e)
                File(filesDir, "last_crash.txt").writeText(trace)
                DebugLog.add(applicationContext, "E", "Crash", trace)
            } catch (_: Throwable) {
            }
            prev?.uncaughtException(t, e)
        }
    }

    private fun showFatal(e: Throwable) {
        Log.e("ArupijiGame", "Gagal membuka game", e)
        DebugLog.add(applicationContext, "E", "Game", Log.getStackTraceString(e))
        ErrorDialog.show(this, "Game gagal dibuka", Log.getStackTraceString(e)) { finish() }
    }

    private fun initGame() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        val path = intent.getStringExtra("path") ?: ""
        gamePath = path
        gameTitle = intent.getStringExtra("title") ?: ""
        defTranslate = intent.getBooleanExtra("translate", false)
        defGamepad = intent.getBooleanExtra("gamepad", true)
        defOpacity = intent.getFloatExtra("opacity", 0.55f)
        debug = intent.getBooleanExtra("debug", false)
        defCursor = intent.getBooleanExtra("cursor", false)
        defCursorSpeed = intent.getFloatExtra("cursorSpeed", 1.6f)
        defCheat = intent.getBooleanExtra("cheat", true)
        defFps = intent.getBooleanExtra("fps", false)
        defBtnScale = intent.getFloatExtra("btnScale", 1f)
        appLang = intent.getStringExtra("appLang") ?: "id"
        if (intent.getBooleanExtra("resetControls", false)) {
            getSharedPreferences("controls", Context.MODE_PRIVATE).edit().remove("layout").apply()
        }
        lang = intent.getStringExtra("lang") ?: "Indonesian"

        val cfg = AiConfig(
            apiKey = intent.getStringExtra("apiKey") ?: "",
            baseUrl = intent.getStringExtra("baseUrl") ?: "",
            model = intent.getStringExtra("model") ?: "",
            lang = lang,
            glossary = intent.getStringExtra("glossary") ?: ""
        )
        hasKey = cfg.apiKey.isNotBlank()

        gp = getSharedPreferences("game_$gameId", Context.MODE_PRIVATE)
        translator = Translator(gameId, cfg, TranslationStoreHolder.get(applicationContext))
        injectJs = assets.open("arupiji/inject.js").bufferedReader().use { it.readText() }

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        web = WebView(this)
        root.addView(web, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        enterImmersive()
        setupWebView()

        val index = File(path, "index.html")
        if (!index.exists()) {
            AlertDialog.Builder(this)
                .setMessage("File game tidak ditemukan. Coba tambahkan ulang game ini.")
                .setPositiveButton("Tutup") { _, _ -> finish() }
                .setCancelable(false)
                .show()
            return
        }
        // Game hasil deploy PC biasanya hanya punya .ogg, sedangkan engine di HP meminta .m4a
        // (atau sebaliknya). Buat alias supaya file yang diminta selalu ada.
        // di folder asli (mode tanpa salin) symlink tidak bisa dibuat, ekstensi audio diperbaiki lewat skrip
        if (path.startsWith(filesDir.absolutePath)) ensureAudioAliases(File(path, "audio"))
        audioExt = detectAudioExt(File(path, "audio"))
        DebugLog.add(applicationContext, "I", "Game", "Membuka $gameTitle ($path)")
        web.loadUrl(Uri.fromFile(index).toString())
    }

    /** Nama stabil untuk folder save (tidak berubah walau game ditambahkan ulang atau diganti judul). */
    private fun stableGameName(): String {
        var t = ""
        try {
            t = JSONObject(File(gamePath, "data/System.json").readText().removePrefix("\uFEFF")).optString("gameTitle")
        } catch (_: Exception) {
        }
        if (t.isBlank()) t = gameTitle
        return t.replace(Regex("[^A-Za-z0-9._ -]+"), "_").trim().ifBlank { "game" }.take(60)
    }

    /**
     * Lokasi save:
     * 1. Game di folder asli (mode Tanpa salin): <folder game>/save, sama seperti versi PC. Bertahan walau app dihapus.
     * 2. Game salinan di dalam app: kalau ada izin Akses semua file, disimpan di /ArupijiPlay/saves/<judul>
     *    supaya bertahan setelah uninstal. Kalau tidak ada izin, di <folder game>/save di dalam app.
     */
    private val saveDir: File by lazy {
        val local = File(gamePath, "save")
        val inApp = gamePath.startsWith(filesDir.absolutePath)
        var dir = local
        if (inApp && GameImporter.hasAllFilesAccess(this)) {
            try {
                val shared = File(Environment.getExternalStorageDirectory(), "ArupijiPlay/saves/" + stableGameName())
                if (shared.exists() || shared.mkdirs()) dir = shared
            } catch (_: Exception) {
            }
        }
        dir.mkdirs()
        dir
    }

    private fun saveFile(name: String) = File(saveDir, File(name).name)

    /** Folder ekspor save: Android/data/<app>/files/saves/<judul game> */
    private fun exportDir(): File {
        val base = getExternalFilesDir(null) ?: filesDir
        val safe = gameTitle.replace(Regex("[^A-Za-z0-9._-]+"), "_").ifBlank { "game" }
        return File(base, "saves/$safe").also { it.mkdirs() }
    }

    private fun detectAudioExt(audio: File): String {
        val exts = HashSet<String>()
        for (d in listOf("bgm", "se", "me", "bgs")) {
            File(audio, d).listFiles()?.take(30)?.forEach { exts.add(it.extension.lowercase()) }
        }
        return when {
            exts.any { it == "ogg" || it == "rpgmvo" || it == "ogg_" } -> ".ogg"
            exts.any { it == "m4a" || it == "rpgmvm" || it == "m4a_" } -> ".m4a"
            else -> ""
        }
    }

    private fun ensureAudioAliases(audioDir: File) {
        if (!audioDir.exists()) return
        try {
            audioDir.walkTopDown().filter { it.isFile }.forEach { f ->
                val other = when (f.extension.lowercase()) {
                    "ogg" -> "m4a"
                    "m4a" -> "ogg"
                    "rpgmvo" -> "rpgmvm"
                    "rpgmvm" -> "rpgmvo"
                    "ogg_" -> "m4a_"
                    "m4a_" -> "ogg_"
                    else -> return@forEach
                }
                val alias = File(f.parentFile, f.nameWithoutExtension + "." + other)
                if (!alias.exists()) {
                    try {
                        Os.symlink(f.absolutePath, alias.absolutePath)
                    } catch (_: Throwable) {
                    }
                }
            }
        } catch (_: Throwable) {
        }
    }

    @Suppress("DEPRECATION")
    private fun setupWebView() {
        web.setBackgroundColor(Color.BLACK)
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        web.addJavascriptInterface(Bridge(), "ArupijiNative")

        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(injectJs, null)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // game lokal tidak boleh dibawa keluar ke situs lain
                return request.url.scheme != "file"
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                DebugLog.add(applicationContext, "W", "Resource", "${request.url} : ${error.description}")
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                finish()
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                val line = "${m.message()} (${m.sourceId()?.substringAfterLast('/')}:${m.lineNumber()})"
                Log.d("ArupijiGame", line)
                when (m.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> DebugLog.add(applicationContext, "E", "JS", line)
                    ConsoleMessage.MessageLevel.WARNING -> DebugLog.add(applicationContext, "W", "JS", line)
                    else -> if (debug) DebugLog.add(applicationContext, "I", "JS", line)
                }
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun getPrefs(): String = JSONObject()
            // semua ini diatur dari halaman Pengaturan launcher dan dikirim saat game dibuka
            .put("translate", defTranslate)
            .put("gamepad", defGamepad)
            .put("opacity", defOpacity.toDouble())
            .put("cursor", defCursor)
            .put("cursorSpeed", defCursorSpeed.toDouble())
            .put("cheat", defCheat)
            .put("fps", defFps)
            .put("btnScale", defBtnScale.toDouble())
            .put("appLang", appLang)
            .put("hasKey", hasKey)
            .put("lang", lang)
            .put("title", gameTitle)
            .put("debug", debug)
            .put("audioExt", audioExt)
            .toString()

        @JavascriptInterface
        fun getControls(): String =
            getSharedPreferences("controls", Context.MODE_PRIVATE).getString("layout", "") ?: ""

        @JavascriptInterface
        fun setControls(json: String) {
            getSharedPreferences("controls", Context.MODE_PRIVATE).edit().putString("layout", json).apply()
        }

        @JavascriptInterface
        fun getCheats(): String = gp.getString("cheats", "") ?: ""

        @JavascriptInterface
        fun setCheats(json: String) {
            gp.edit().putString("cheats", json).apply()
        }

        @JavascriptInterface
        fun saveWrite(name: String, data: String, base64: Boolean): Boolean = try {
            val f = saveFile(name)
            f.parentFile?.mkdirs()
            val tmp = File(f.parentFile, f.name + ".tmp")
            if (base64) tmp.writeBytes(Base64.decode(data, Base64.DEFAULT)) else tmp.writeText(data)
            if (f.exists()) f.delete()
            tmp.renameTo(f) || run { tmp.copyTo(f, true); tmp.delete(); true }
        } catch (e: Exception) {
            DebugLog.add(applicationContext, "E", "Save", e.stackTraceToString())
            false
        }

        @JavascriptInterface
        fun saveRead(name: String, base64: Boolean): String = try {
            val f = saveFile(name)
            when {
                !f.exists() -> ""
                base64 -> Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
                else -> f.readText()
            }
        } catch (_: Exception) {
            ""
        }

        @JavascriptInterface
        fun saveExists(name: String): Boolean = try {
            saveFile(name).exists()
        } catch (_: Exception) {
            false
        }

        @JavascriptInterface
        fun saveDelete(name: String): Boolean = try {
            saveFile(name).delete()
        } catch (_: Exception) {
            false
        }

        @JavascriptInterface
        fun saveDirPath(): String = saveDir.absolutePath

        @JavascriptInterface
        fun savePatch(json: String): Boolean = try {
            DataPatch.add(File(gamePath), json)
            true
        } catch (e: Exception) {
            DebugLog.add(applicationContext, "E", "Patch", e.stackTraceToString())
            false
        }

        @JavascriptInterface
        fun resetPatches(): Int = try {
            DataPatch.reset(File(gamePath))
        } catch (e: Exception) {
            DebugLog.add(applicationContext, "E", "Patch", e.stackTraceToString())
            -1
        }

        @JavascriptInterface
        fun patchCount(): Int = try {
            DataPatch.count(File(gamePath))
        } catch (_: Exception) {
            0
        }

        @JavascriptInterface
        fun writeExport(name: String, text: String): String {
            val f = File(exportDir(), File(name).name)
            f.writeText(text)
            return f.absolutePath
        }

        @JavascriptInterface
        fun readExport(name: String): String = try {
            File(exportDir(), File(name).name).readText()
        } catch (_: Exception) {
            ""
        }

        @JavascriptInterface
        fun listExports(): String {
            val arr = JSONArray()
            exportDir().listFiles()?.sortedByDescending { it.lastModified() }?.forEach { arr.put(it.name) }
            return arr.toString()
        }

        @JavascriptInterface
        fun log(level: String, msg: String) {
            if (level == "E" || level == "W" || debug) DebugLog.add(applicationContext, level, "JS", msg)
        }

        @JavascriptInterface
        fun readLog(): String {
            val lines = DebugLog.read(applicationContext).lines().filter { it.isNotBlank() }
            return lines.takeLast(120).joinToString("\n")
        }

        @JavascriptInterface
        fun clearLog() {
            DebugLog.clear(applicationContext)
        }

        @JavascriptInterface
        fun copyText(text: String) {
            runOnUiThread {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("log", text))
            }
        }

        @JavascriptInterface
        fun setPref(key: String, value: String) {
            val e = gp.edit()
            when (key) {
                "opacity" -> e.putFloat(key, value.toFloatOrNull() ?: 0.55f)
                "cursorSpeed" -> e.putFloat(key, value.toFloatOrNull() ?: 1.6f)
                "translate", "gamepad", "cursor" -> e.putBoolean(key, value == "true")
            }
            e.apply()
        }

        @JavascriptInterface
        fun translate(reqId: Int, text: String) {
            io.execute {
                val out = translator.translate(text)
                val js = "window.__arupiji&&window.__arupiji.onResult($reqId," +
                    "${JSONObject.quote(out.text)},${JSONObject.quote(out.source)})"
                runOnUiThread { if (!isDestroyed) web.evaluateJavascript(js, null) }
            }
        }

        @JavascriptInterface
        fun translateBatch(reqId: Int, json: String) {
            io.execute {
                val texts = JSONArray()
                val sources = JSONArray()
                try {
                    val arr = JSONArray(json)
                    val items = List(arr.length()) { arr.getString(it) }
                    translator.translateBatch(items).forEach {
                        texts.put(it.text)
                        sources.put(it.source)
                    }
                } catch (e: Exception) {
                    Log.w("Arupiji", "translateBatch: ${e.message}")
                }
                val js = "window.__arupiji&&window.__arupiji.onBatch($reqId," +
                    "${JSONObject.quote(texts.toString())},${JSONObject.quote(sources.toString())})"
                runOnUiThread { if (!isDestroyed) web.evaluateJavascript(js, null) }
            }
        }

        @JavascriptInterface
        fun saveOverride(original: String, custom: String) {
            io.execute { TranslationStoreHolder.get(applicationContext).putOverride(gameId, original, custom) }
        }

        @JavascriptInterface
        fun exitGame() {
            runOnUiThread { finish() }
        }
    }

    @Suppress("DEPRECATION")
    private fun enterImmersive() {
        try {
            var done = false
            if (Build.VERSION.SDK_INT >= 30) {
                window.setDecorFitsSystemWindows(false)
                val c = window.insetsController
                if (c != null) {
                    c.hide(WindowInsets.Type.systemBars())
                    c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    done = true
                }
            }
            if (!done) {
                window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
            }
        } catch (e: Throwable) {
            Log.w("ArupijiGame", "Mode layar penuh gagal: ${e.message}")
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        AlertDialog.Builder(this)
            .setMessage("Keluar dari game? Progres yang belum disimpan akan hilang.")
            .setPositiveButton("Keluar") { _, _ -> finish() }
            .setNegativeButton("Lanjut main", null)
            .show()
    }

    override fun onPause() {
        super.onPause()
        if (::web.isInitialized) {
            web.onPause()
            web.pauseTimers()
        }
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) {
            web.onResume()
            web.resumeTimers()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        io.shutdown()
        try {
            if (::web.isInitialized) {
                (web.parent as? ViewGroup)?.removeView(web)
                web.destroy()
            }
        } catch (_: Throwable) {
        }
        // Proses :game dimatikan supaya game berikutnya mulai dengan WebView bersih
        Process.killProcess(Process.myPid())
    }
}

object TranslationStoreHolder {
    @Volatile private var inst: TranslationStore? = null
    fun get(ctx: Context): TranslationStore =
        inst ?: synchronized(this) { inst ?: TranslationStore(ctx).also { inst = it } }
}
