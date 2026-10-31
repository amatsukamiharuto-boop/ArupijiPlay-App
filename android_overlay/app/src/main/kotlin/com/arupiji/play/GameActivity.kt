package com.arupiji.play

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Process
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
    private var hasKey = false
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
                File(filesDir, "last_crash.txt").writeText(Log.getStackTraceString(e))
            } catch (_: Throwable) {
            }
            prev?.uncaughtException(t, e)
        }
    }

    private fun showFatal(e: Throwable) {
        val msg = Log.getStackTraceString(e)
        Log.e("ArupijiGame", "Gagal membuka game", e)
        val tv = android.widget.TextView(this).apply {
            text = msg
            textSize = 11f
            setPadding(32, 24, 32, 24)
            setTextIsSelectable(true)
        }
        val sv = android.widget.ScrollView(this).apply { addView(tv) }
        AlertDialog.Builder(this)
            .setTitle("Game gagal dibuka")
            .setView(sv)
            .setPositiveButton("Tutup") { _, _ -> finish() }
            .setCancelable(false)
            .show()
    }

    private fun initGame() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        enterImmersive()

        val path = intent.getStringExtra("path") ?: ""
        gameTitle = intent.getStringExtra("title") ?: ""
        defTranslate = intent.getBooleanExtra("translate", false)
        defGamepad = intent.getBooleanExtra("gamepad", true)
        defOpacity = intent.getFloatExtra("opacity", 0.55f)
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
        web.loadUrl(Uri.fromFile(index).toString())
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

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                finish()
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.d("ArupijiGame", "${m.message()} (${m.sourceId()}:${m.lineNumber()})")
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
            .put("translate", gp.getBoolean("translate", defTranslate))
            .put("gamepad", gp.getBoolean("gamepad", defGamepad))
            .put("opacity", gp.getFloat("opacity", defOpacity).toDouble())
            .put("hasKey", hasKey)
            .put("lang", lang)
            .put("title", gameTitle)
            .toString()

        @JavascriptInterface
        fun setPref(key: String, value: String) {
            val e = gp.edit()
            when (key) {
                "opacity" -> e.putFloat(key, value.toFloatOrNull() ?: 0.55f)
                "translate", "gamepad" -> e.putBoolean(key, value == "true")
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
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
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
        web.onPause()
        web.pauseTimers()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        web.resumeTimers()
    }

    override fun onDestroy() {
        super.onDestroy()
        io.shutdown()
        try {
            (web.parent as? ViewGroup)?.removeView(web)
            web.destroy()
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
