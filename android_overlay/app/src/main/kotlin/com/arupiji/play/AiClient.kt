package com.arupiji.play

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Klien chat-completions sederhana (endpoint kompatibel OpenAI). */
class AiClient(
    private val apiKey: String,
    private val baseUrl: String,
    private val model: String
) {
    fun ready() = apiKey.isNotBlank() && baseUrl.isNotBlank() && model.isNotBlank()

    fun <T> retry(times: Int = 2, block: () -> T): T {
        var last: IOException? = null
        for (i in 0 until times) {
            try {
                return block()
            } catch (e: IOException) {
                last = e
                Thread.sleep(1200L * (i + 1))
            }
        }
        throw last ?: IOException("unknown")
    }

    fun chat(system: String, user: String): String {
        val conn = URL(baseUrl.trimEnd('/') + "/chat/completions").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 90_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $apiKey")

            val body = JSONObject()
                .put("model", model)
                .put("temperature", 0.3)
                .put(
                    "messages", JSONArray()
                        .put(JSONObject().put("role", "system").put("content", system))
                        .put(JSONObject().put("role", "user").put("content", user))
                )
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val resp = stream?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) throw IOException("HTTP $code ${resp.take(160)}")

            return JSONObject(resp)
                .getJSONArray("choices").getJSONObject(0)
                .getJSONObject("message").getString("content").trim()
        } finally {
            conn.disconnect()
        }
    }
}
